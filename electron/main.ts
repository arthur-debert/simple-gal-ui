/**
 * Electron main-process bootstrap.
 *
 * This file is deliberately tiny and imports ONLY modules that cannot fail
 * at resolution time — electron itself, and Node built-ins. It installs
 * global `uncaughtException` / `unhandledRejection` handlers that write a
 * full stack trace to a log file and then exit the process cleanly.
 *
 * THEN it dynamically imports `./app.js`, which is where the real main-
 * process logic lives. Because that import happens at runtime (not during
 * ESM resolution), any failure to resolve a transitive dependency —
 * electron-store not being bundled, chokidar ABI mismatch, a native module
 * missing — becomes a rejected promise our bootstrap catches, writes to
 * the log file, and shows in a dialog before quitting.
 *
 * Without this split, a missing-module error crashes Electron BEFORE any
 * of our handlers run, leaving a stack of zombie "JavaScript exception"
 * dialogs and no captured stderr — which is how I ended up with ten open
 * windows while debugging the DMG.
 *
 * Log location:
 *   - `$SGUI_STARTUP_LOG/last-error.log` if the env var is set (used by
 *     automated smoke tests to read from a known path).
 *   - Otherwise `<userData>/logs/last-error.log` in production, or
 *     `$TMPDIR/simple-gal-ui-startup-logs/last-error.log` as a last
 *     resort if `app.getPath('userData')` fails.
 * Every run also gets a timestamped `startup-<ts>.log` in the same
 * directory so you can walk the history.
 */
import { app, dialog } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

function resolveLogDir(): string {
	if (process.env.SGUI_STARTUP_LOG) return process.env.SGUI_STARTUP_LOG;
	try {
		return path.join(app.getPath('userData'), 'logs');
	} catch {
		return path.join(process.env.TMPDIR ?? '/tmp', 'simple-gal-ui-startup-logs');
	}
}

function writeStartupError(label: string, err: unknown): string {
	const dir = resolveLogDir();
	try {
		mkdirSync(dir, { recursive: true });
	} catch {
		// ignore — appendFileSync below will fail if truly unusable
	}
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const logPath = path.join(dir, `startup-${ts}.log`);
	const lastPath = path.join(dir, 'last-error.log');
	const e = err as Error & { stack?: string; code?: string };
	const lines = [
		`[${new Date().toISOString()}] ${label}`,
		`message: ${e?.message ?? String(err)}`,
		e?.code ? `code: ${e.code}` : null,
		`stack:\n${e?.stack ?? '(no stack)'}`,
		`cwd: ${process.cwd()}`,
		`execPath: ${process.execPath}`,
		`versions: ${JSON.stringify(process.versions)}`,
		''
	]
		.filter((l): l is string => l !== null)
		.join('\n');
	try {
		appendFileSync(logPath, lines);
		appendFileSync(lastPath, lines);
	} catch {
		// Logging itself failed — nothing more we can do.
	}
	return lastPath;
}

function handleFatal(label: string, err: unknown): void {
	const logPath = writeStartupError(label, err);
	console.error(`[simple-gal-ui] ${label} → ${logPath}`, err);
	// Skip the blocking error dialog when running under automation
	// (SGUI_STARTUP_LOG is only set by tests). In that mode the log file
	// is the source of truth and the dialog would hang the process
	// waiting for a user dismiss that will never come.
	if (!process.env.SGUI_STARTUP_LOG) {
		try {
			dialog.showErrorBox(
				'simple-gal-ui failed to start',
				`${(err as Error)?.message ?? String(err)}\n\nFull log:\n${logPath}`
			);
		} catch {
			// ignore — the Electron runtime may be too broken to show a dialog
		}
	}
	// Belt and suspenders termination:
	//   1. `app.exit(1)` is the "nice" Electron-aware exit (may no-op
	//      before app.whenReady on Linux/Windows).
	//   2. `process.exit(1)` is Node-level but can be blocked by
	//      Electron's C++ event loop on Linux.
	//   3. `process.kill(process.pid, 'SIGKILL')` is a kernel-level
	//      hard stop — the OS terminates the process unconditionally,
	//      signal-handlers can't intercept it. This always works.
	try {
		app.exit(1);
	} catch {
		// ignore — app module may not be ready yet
	}
	try {
		process.exit(1);
	} catch {
		// ignore
	}
	try {
		process.kill(process.pid, 'SIGKILL');
	} catch {
		// nothing more we can do
	}
}

process.on('uncaughtException', (err) => handleFatal('uncaughtException', err));
process.on('unhandledRejection', (reason) => handleFatal('unhandledRejection', reason));

// Test hook: when SGUI_FORCE_STARTUP_ERROR is set, skip the real app
// entry entirely and throw a synthetic error to exercise the error-
// logging + exit path. The packaged smoke suite uses this to assert
// the infra works without needing to actually break the app.
if (process.env.SGUI_FORCE_STARTUP_ERROR) {
	handleFatal('bootstrap-failed', new Error(process.env.SGUI_FORCE_STARTUP_ERROR));
} else {
	// Hand off to the real main-process entry. Any failure — including a
	// static-import resolution error inside app.ts or its transitive deps —
	// is caught here and routed through handleFatal.
	import('./app.js').catch((err) => handleFatal('bootstrap-failed', err));
}
