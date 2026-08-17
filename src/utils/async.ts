export class OperationTimeoutError extends Error {
  readonly operation: string;
  readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = 'OperationTimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export class OperationCancelledError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super(`${operation} was cancelled`);
    this.name = 'OperationCancelledError';
    this.operation = operation;
  }
}

interface WithTimeoutOptions<T> {
  signal?: AbortSignal;
  /** Cleanup a value that resolves after the caller has already timed out/cancelled. */
  onLateResolve?: (value: T) => void;
}

/**
 * Bound a browser operation that may otherwise remain pending forever.
 *
 * Browser media promises cannot always be physically cancelled. When a late
 * value arrives after timeout/cancellation, onLateResolve guarantees that
 * resources such as MediaStreams are immediately disposed.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
  options: WithTimeoutOptions<T> = {},
): Promise<T> {
  const { signal, onLateResolve } = options;

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', handleAbort);
      callback();
      return true;
    };

    const handleAbort = () => {
      finish(() => reject(new OperationCancelledError(operation)));
    };

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new OperationTimeoutError(operation, timeoutMs)));
    }, timeoutMs);

    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener('abort', handleAbort, { once: true });

    promise.then(
      (value) => {
        if (!finish(() => resolve(value))) {
          try {
            onLateResolve?.(value);
          } catch (error) {
            console.warn(`[async] Late cleanup failed for ${operation}:`, error);
          }
        }
      },
      (error) => {
        // A late rejection is intentionally consumed so it cannot become an
        // unhandled rejection after the caller has already recovered.
        finish(() => reject(error));
      },
    );
  });
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return withTimeout(
    new Promise<void>((resolve) => window.setTimeout(resolve, ms)),
    ms + 1000,
    'delay',
    { signal },
  );
}
