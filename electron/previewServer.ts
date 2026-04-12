import http from 'node:http';
import type { AddressInfo } from 'node:net';
import serveHandler from 'serve-handler';

/**
 * A single local preview server, bound to 127.0.0.1 on an ephemeral port.
 * The served directory can be swapped at runtime via `setRoot`, so a rebuild
 * just points the server at the fresh dist.
 */

let server: http.Server | null = null;
let currentRoot: string | null = null;
let currentUrl: string | null = null;

export function getCurrentRoot(): string | null {
	return currentRoot;
}

export function getCurrentUrl(): string | null {
	return currentUrl;
}

export async function ensureServer(root: string): Promise<string> {
	currentRoot = root;
	if (server) return currentUrl!;

	server = http.createServer((req, res) => {
		serveHandler(req, res, {
			public: currentRoot ?? root,
			directoryListing: false
		}).catch((err) => {
			console.error('[preview-server] serve-handler error', err);
			if (!res.headersSent) {
				res.writeHead(500);
				res.end('preview server error');
			}
		});
	});

	await new Promise<void>((resolve, reject) => {
		server!.once('error', reject);
		server!.listen(0, '127.0.0.1', () => {
			server!.removeListener('error', reject);
			resolve();
		});
	});

	const addr = server.address() as AddressInfo;
	currentUrl = `http://127.0.0.1:${addr.port}/`;
	return currentUrl;
}

export function setRoot(root: string): void {
	currentRoot = root;
}

export async function stopServer(): Promise<void> {
	if (!server) return;
	await new Promise<void>((resolve) => server!.close(() => resolve()));
	server = null;
	currentRoot = null;
	currentUrl = null;
}
