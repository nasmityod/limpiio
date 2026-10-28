import { expect, it, vi } from 'vitest';
import { applyBackupRetention } from '@/scripts/lib/backup-retention.mjs';

it('keeps backups of another valid instance whose slug starts with this slug and underscore', async () => {
  const own = 'backups/shop_20260101_010101.dump';
  const other = 'backups/shop_other_20260101_010101.dump';
  const client = { send: vi.fn().mockResolvedValueOnce({ Contents: [own, other].map(Key => ({ Key, LastModified: new Date(0) })) }).mockResolvedValueOnce({}) };
  expect(await applyBackupRetention(client, { bucket: 'private', prefix: 'backups/shop_', cutoff: Date.now() })).toBe(1);
  expect(client.send.mock.calls[1][0].input.Delete.Objects).toEqual([{ Key: own }]);
});
