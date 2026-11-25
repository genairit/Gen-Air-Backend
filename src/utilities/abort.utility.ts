const toAbortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new Error('Operation was aborted');

export const withAbort = async <T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> => {
  signal.throwIfAborted();

  const listener = new AbortController();
  const aborted = new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(toAbortError(signal)), {
      once: true,
      signal: listener.signal,
    });
  });

  try {
    return await Promise.race([operation, aborted]);
  } finally {
    listener.abort();
  }
};

export const remainingUntil = (deadline: number): number =>
  Math.max(0, deadline - Date.now());

export const signalWithTimeout = (
  signal: AbortSignal,
  timeoutMs: number,
): AbortSignal => AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
