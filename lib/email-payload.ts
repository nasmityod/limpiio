import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto';

function secret(): string {
  const value = process.env.EMAIL_DELIVERY_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value || value.length < 16) throw new Error('Email delivery secret is not configured');
  return value;
}

export function reminderToken(id: string, purpose: 'recovery' | 'unsubscribe'): string {
  return createHmac('sha256', secret()).update(`${purpose}:${id}`).digest('hex');
}

export function encryptEmailPayload(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret()).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(v => v.toString('base64url')).join('.');
}

export function decryptEmailPayload<T>(encrypted: string): T {
  const parts = encrypted.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted email payload');
  const [iv, tag, data] = parts.map(v => Buffer.from(v, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret()).digest(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')) as T;
}
