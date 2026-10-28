import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

/** Bounded listing/deletion. HTTP success can still contain per-object errors. */
export async function applyBackupRetention(client, { bucket, prefix, cutoff }) {
  // Listing prefixes alone do not isolate `shop` from `shop_other`.
  const suffix = /^\d{8}_\d{6}\.dump$/;
  let continuationToken;
  let deleted = 0;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1000, ContinuationToken: continuationToken }));
    const stale = (page.Contents ?? []).filter(obj => obj.Key?.startsWith(prefix) && suffix.test(obj.Key.slice(prefix.length)) && obj.LastModified && obj.LastModified.getTime() < cutoff).map(obj => ({ Key: obj.Key }));
    for (let i = 0; i < stale.length; i += 1000) {
      const result = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: stale.slice(i, i + 1000) } }));
      if (result.Errors?.length) throw new Error(`Backup retention: ${result.Errors.length} object deletion(s) failed`);
      deleted += Math.min(1000, stale.length - i);
    }
    if (page.IsTruncated && (!page.NextContinuationToken || page.NextContinuationToken === continuationToken)) throw new Error('Backup retention: invalid continuation token');
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return deleted;
}
