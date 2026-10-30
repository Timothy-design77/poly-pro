export class OperationTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = 'OperationTimeoutError';
  }
}

/** Bound audio startup waits; callers own microphone/context cleanup. */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OperationTimeoutError(operation, timeoutMs)), timeoutMs);
    onAbort = () => reject(new DOMException(`${operation} was cancelled`, 'AbortError'));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
  // race also consumes a late rejection after timeout or cancellation.
  return Promise.race([interrupted, promise]).finally(() => {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  });
}
