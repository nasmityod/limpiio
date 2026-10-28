import { expect, it, vi } from 'vitest';
import { applyBackupRetention } from '@/scripts/lib/backup-retention.mjs';
it('fails visibly on per-object deletion error and does not certify retention success', async () => {
  const client = { send: vi.fn().mockResolvedValueOnce({ Contents: [{ Key: 'backups/shop_20260101_010101.dump', LastModified: new Date(0) }] }).mockResolvedValueOnce({ Errors: [{ Code: 'AccessDenied' }] }) };
  await expect(applyBackupRetention(client, { bucket: 'private', prefix: 'backups/shop_', cutoff: Date.now() })).rejects.toThrow('deletion(s) failed');
});
it('processes pages separately and protects other instance prefixes', async () => {
  const client = { send: vi.fn().mockResolvedValueOnce({ Contents: [{ Key: 'backups/shop_20260101_010101.dump', LastModified: new Date(0) }, { Key: 'backups/other_20260101_010101.dump', LastModified: new Date(0) }], IsTruncated: true, NextContinuationToken: 'next' }).mockResolvedValueOnce({}).mockResolvedValueOnce({ Contents: [{ Key: 'backups/shop_20260102_010101.dump', LastModified: new Date(0) }] }).mockResolvedValueOnce({}) };
  expect(await applyBackupRetention(client, { bucket: 'private', prefix: 'backups/shop_', cutoff: Date.now() })).toBe(2);
  expect(client.send.mock.calls[1][0].input.Delete.Objects).toEqual([{ Key: 'backups/shop_20260101_010101.dump' }]);
  expect(client.send.mock.calls[2][0].input.ContinuationToken).toBe('next');
});
