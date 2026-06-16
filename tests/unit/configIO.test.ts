import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  deleteConfigFileIfEmpty,
  flattenDottedKeys,
  getDotted,
  readConfigFile,
  setDotted,
  unsetDotted,
  writeConfigFileAtomic
} from '../../electron/configIO.js';

// `configIO` underpins the config-loader read path and the four pure
// dotted-key helpers (`flattenDottedKeys`, `getDotted`, `setDotted`,
// `unsetDotted`) used across `configLoader.ts` and the config-editor UI.
// (Note: `electron/configSave.ts` does its own TOML stringify + tmp
// rename today rather than calling `writeConfigFileAtomic` — so the
// write-path coverage here is for the exported primitives, not for the
// save flow.) These helpers were previously exercised only via
// Playwright e2e specs — a logic bug in, say, the unset-prune loop
// would have surfaced as a confusing UI-level failure miles from the
// cause. These tests pin down the contract directly.

// A collision-proof tmp path for the "this file should be absent" tests
// below: Date.now() alone can repeat on a single ms tick or be left
// behind from a prior run, masking a real bug behind a flaky pass.
function uniqueTmp(prefix: string): string {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${randomBytes(8).toString('hex')}`);
}

describe('flattenDottedKeys', () => {
  it('returns an empty list for an empty object', () => {
    expect(flattenDottedKeys({})).toEqual([]);
  });

  it('lists shallow keys verbatim', () => {
    expect(flattenDottedKeys({ a: 1, b: 'x' }).sort()).toEqual(['a', 'b']);
  });

  it('joins nested keys with dots', () => {
    const keys = flattenDottedKeys({
      images: { quality: 85, sizes: [600, 1200] },
      colors: { light: { background: '#fff' } }
    }).sort();
    expect(keys).toEqual(['colors.light.background', 'images.quality', 'images.sizes']);
  });

  it('treats arrays as leaves and does not recurse into them', () => {
    expect(flattenDottedKeys({ a: [1, { nested: true }, 3] })).toEqual(['a']);
  });

  it('honors a prefix', () => {
    expect(flattenDottedKeys({ a: 1, b: { c: 2 } }, 'root').sort()).toEqual(['root.a', 'root.b.c']);
  });

  it('treats null as a leaf (not a recursable object)', () => {
    expect(flattenDottedKeys({ a: null, b: { c: null } }).sort()).toEqual(['a', 'b.c']);
  });
});

describe('getDotted', () => {
  it('reads a top-level key', () => {
    expect(getDotted({ a: 1 }, 'a')).toBe(1);
  });

  it('reads a nested key', () => {
    expect(getDotted({ a: { b: { c: 'deep' } } }, 'a.b.c')).toBe('deep');
  });

  it('returns undefined when any segment along the path is missing', () => {
    expect(getDotted({ a: { b: 1 } }, 'a.x.y')).toBeUndefined();
    expect(getDotted({}, 'anything')).toBeUndefined();
  });

  it('returns undefined when a mid-path segment is a non-object (e.g. an array)', () => {
    expect(getDotted({ a: [1, 2, 3] }, 'a.0')).toBeUndefined();
  });
});

describe('setDotted', () => {
  it('sets a top-level key', () => {
    const obj: Record<string, unknown> = {};
    setDotted(obj, 'a', 42);
    expect(obj).toEqual({ a: 42 });
  });

  it('creates intermediate tables as needed', () => {
    const obj: Record<string, unknown> = {};
    setDotted(obj, 'colors.light.background', '#fff');
    expect(obj).toEqual({ colors: { light: { background: '#fff' } } });
  });

  it('preserves sibling keys when descending an existing branch', () => {
    const obj: Record<string, unknown> = { colors: { light: { text: '#222' } } };
    setDotted(obj, 'colors.light.background', '#fff');
    expect(obj).toEqual({ colors: { light: { text: '#222', background: '#fff' } } });
  });

  it('overwrites a non-object mid-path value with a fresh table', () => {
    // If the user had `colors = "blue"` as a string, then sets
    // `colors.light.background`, the primitive must be replaced — the
    // app cannot represent a string and a table at the same key.
    const obj: Record<string, unknown> = { colors: 'blue' };
    setDotted(obj, 'colors.light.background', '#fff');
    expect(obj).toEqual({ colors: { light: { background: '#fff' } } });
  });

  it('returns the mutated object so callers can chain', () => {
    const obj: Record<string, unknown> = {};
    expect(setDotted(obj, 'a', 1)).toBe(obj);
  });
});

describe('unsetDotted', () => {
  it('removes a leaf key', () => {
    const obj: Record<string, unknown> = { a: 1, b: 2 };
    unsetDotted(obj, 'a');
    expect(obj).toEqual({ b: 2 });
  });

  it('removes a deep leaf and prunes the parent when it becomes empty', () => {
    const obj: Record<string, unknown> = { colors: { light: { background: '#fff' } } };
    unsetDotted(obj, 'colors.light.background');
    // Both [colors.light] and [colors] should be pruned — they are now
    // empty, and leaving them around would write back orphan tables.
    expect(obj).toEqual({});
  });

  it('stops pruning at the first non-empty ancestor', () => {
    const obj: Record<string, unknown> = {
      colors: { light: { background: '#fff' }, dark: { background: '#000' } }
    };
    unsetDotted(obj, 'colors.light.background');
    expect(obj).toEqual({ colors: { dark: { background: '#000' } } });
  });

  it('is a no-op when a mid-path segment is missing', () => {
    const obj: Record<string, unknown> = { a: 1 };
    unsetDotted(obj, 'x.y.z');
    expect(obj).toEqual({ a: 1 });
  });

  it('is a no-op when a mid-path segment is a non-object (e.g. an array)', () => {
    const obj: Record<string, unknown> = { a: [1, 2, 3] };
    unsetDotted(obj, 'a.0');
    expect(obj).toEqual({ a: [1, 2, 3] });
  });
});

describe('readConfigFile', () => {
  it('returns exists:false for a missing file (does not throw)', async () => {
    const result = await readConfigFile(uniqueTmp('sgui-vitest-missing'));
    expect(result.exists).toBe(false);
    expect(result.raw).toBeNull();
    expect(result.parsed).toEqual({});
    expect(result.loadedKeys).toEqual([]);
  });

  it('parses a TOML file and reports its dotted leaf keys', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sgui-vitest-read-'));
    const file = path.join(dir, 'config.toml');
    await fs.writeFile(
      file,
      [
        '[images]',
        'quality = 85',
        '',
        '[colors.light]',
        'background = "#fafafa"',
        'text = "#222222"'
      ].join('\n'),
      'utf8'
    );
    try {
      const result = await readConfigFile(file);
      expect(result.exists).toBe(true);
      expect(result.parsed).toMatchObject({
        images: { quality: 85 },
        colors: { light: { background: '#fafafa', text: '#222222' } }
      });
      expect(result.loadedKeys.sort()).toEqual([
        'colors.light.background',
        'colors.light.text',
        'images.quality'
      ]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('writeConfigFileAtomic + deleteConfigFileIfEmpty', () => {
  it('round-trips a payload through TOML and reports byte count', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sgui-vitest-write-'));
    const file = path.join(dir, 'config.toml');
    try {
      const { writtenBytes } = await writeConfigFileAtomic(file, {
        images: { quality: 90 }
      });
      const raw = await fs.readFile(file, 'utf8');
      expect(raw).toContain('[images]');
      expect(raw).toContain('quality = 90');
      expect(writtenBytes).toBe(Buffer.byteLength(raw, 'utf8'));
      const back = await readConfigFile(file);
      expect(back.parsed).toEqual({ images: { quality: 90 } });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('writes an empty file (no body) for an empty payload', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sgui-vitest-empty-'));
    const file = path.join(dir, 'config.toml');
    try {
      await writeConfigFileAtomic(file, {});
      const raw = await fs.readFile(file, 'utf8');
      expect(raw).toBe('');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('creates parent directories on first write', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sgui-vitest-mkdir-'));
    const file = path.join(dir, 'nested', 'sub', 'config.toml');
    try {
      await writeConfigFileAtomic(file, { a: 1 });
      const raw = await fs.readFile(file, 'utf8');
      expect(raw).toContain('a = 1');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('deleteConfigFileIfEmpty removes a zero/whitespace-only file and reports true', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sgui-vitest-del-'));
    const file = path.join(dir, 'config.toml');
    try {
      await fs.writeFile(file, '   \n  \n', 'utf8');
      const removed = await deleteConfigFileIfEmpty(file);
      expect(removed).toBe(true);
      // Tighten the absence check to ENOENT specifically — a permission
      // error or unmounted volume would also reject and the test would
      // green-light without proving the file is gone.
      await expect(fs.access(file)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('deleteConfigFileIfEmpty leaves a non-empty file alone and reports false', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sgui-vitest-del-keep-'));
    const file = path.join(dir, 'config.toml');
    try {
      await fs.writeFile(file, 'a = 1\n', 'utf8');
      const removed = await deleteConfigFileIfEmpty(file);
      expect(removed).toBe(false);
      expect(await fs.readFile(file, 'utf8')).toBe('a = 1\n');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('deleteConfigFileIfEmpty is a no-op (returns false) when the file is absent', async () => {
    const removed = await deleteConfigFileIfEmpty(uniqueTmp('sgui-vitest-missing'));
    expect(removed).toBe(false);
  });
});
