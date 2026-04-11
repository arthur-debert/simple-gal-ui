export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
	id: number;
	kind: ToastKind;
	title: string;
	body?: string;
	timeoutMs: number;
}

interface ToastState {
	items: Toast[];
}

const state = $state<ToastState>({ items: [] });
let nextId = 1;

export const toasts = {
	get items() {
		return state.items;
	}
};

export function showToast(input: {
	kind: ToastKind;
	title: string;
	body?: string;
	timeoutMs?: number;
}): number {
	const id = nextId++;
	// Errors stick around until explicitly dismissed so they can't be missed;
	// everything else auto-dismisses after 4s (or whatever the caller passes).
	const defaultTimeout = input.kind === 'error' ? 0 : 4000;
	const toast: Toast = {
		id,
		kind: input.kind,
		title: input.title,
		body: input.body,
		timeoutMs: input.timeoutMs ?? defaultTimeout
	};
	state.items = [...state.items, toast];
	if (toast.timeoutMs > 0) {
		setTimeout(() => dismissToast(id), toast.timeoutMs);
	}
	return id;
}

export function dismissToast(id: number): void {
	state.items = state.items.filter((t) => t.id !== id);
}
