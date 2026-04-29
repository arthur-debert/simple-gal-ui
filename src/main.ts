// Canonical E2E hooks — see ~/.claude/skills/electron-e2e-testing/SKILL.md.
// Defines the shared window.__e2e state for the renderer. App.svelte's
// $effect flips ready.app to true on first paint. Initialized before
// mount() so the App component's first render finds the namespace in place.
const MAX_E2E_EVENTS = 1000;

window.__e2e = {
	ready: { app: false },
	events: [],
	bridge: {},
	signal(type, payload) {
		this.events.push({ type, ts: Date.now(), payload });
		if (this.events.length > MAX_E2E_EVENTS) {
			this.events.splice(0, this.events.length - MAX_E2E_EVENTS);
		}
	}
};

import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const app = mount(App, {
	target: document.getElementById('app')!
});

export default app;
