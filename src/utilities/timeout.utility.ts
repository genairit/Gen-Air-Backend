export class OperationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Operation exceeded ${timeoutMs}ms`);
    this.name = OperationTimeoutError.name;
  }
}

export const withTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  const controller = new AbortController();
  const timeout = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(
      () => reject(new OperationTimeoutError(timeoutMs)),
      timeoutMs,
    );
    controller.signal.addEventListener('abort', () => clearTimeout(timer));
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    controller.abort();
  }
};
