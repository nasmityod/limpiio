import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('site-shell-cache tags', () => {
  it('SHELL_CACHE_TAGS incluye store-settings', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/site-shell-cache.ts'),
      'utf8',
    );
    expect(src).toContain("'store-settings'");
    expect(src).toMatch(/SHELL_CACHE_TAGS\s*=\s*\[[\s\S]*'store-settings'/);
  });
});
