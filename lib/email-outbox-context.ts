import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';

const transactions = new AsyncLocalStorage<Prisma.TransactionClient>();

/** Execute existing email wrappers as durable inserts in the business transaction.
 * Rendering is local; provider I/O is performed later by the dispatcher. */
export function queueTransactionalEmails<T>(tx: Prisma.TransactionClient, enqueue: () => Promise<T>): Promise<T> {
  return transactions.run(tx, enqueue);
}

export function emailOutboxTransaction(): Prisma.TransactionClient | undefined {
  return transactions.getStore();
}
