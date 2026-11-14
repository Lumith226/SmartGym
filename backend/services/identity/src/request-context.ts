import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const requestContext = new AsyncLocalStorage<string>();
export const correlationId = () => requestContext.getStore() ?? randomUUID();
