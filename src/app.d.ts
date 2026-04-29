import type { Api } from '../electron/preload';

// Canonical E2E hooks contract — see ~/.claude/skills/electron-e2e-testing/SKILL.md.
// Bridge is an open record so projects can add verbs without updating this type.
interface E2EHooks {
	ready: { app: boolean; [k: string]: boolean };
	events: Array<{ type: string; ts: number; payload?: unknown }>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	bridge: Record<string, (...args: any[]) => any>;
	signal(type: string, payload?: unknown): void;
}

declare global {
	interface Window {
		api: Api;
		__e2e: E2EHooks;
	}
}

export {};
