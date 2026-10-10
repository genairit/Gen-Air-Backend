import { pinoLogger } from './logger';
import { normalizeError } from '../utilities/normalize-error.utility';

export type Meta = {
  event?: string;
  message: string;
  [key: string]: unknown;
};

export type ErrorMeta<TMeta extends Meta> = TMeta & {
  error: Error | string | unknown;
};

export class TypedLogger<TMeta extends Meta> {
  public static global = new TypedLogger<Meta>();

  constructor(private readonly context?: string) {}

  private formatMeta<T extends TMeta>(meta: T) {
    if (!this.context) {
      return { ...meta };
    }

    return { context: this.context, ...meta };
  }

  public info(meta: TMeta) {
    pinoLogger.info(this.formatMeta(meta));
  }

  public error(meta: ErrorMeta<TMeta>) {
    const error = normalizeError(meta.error);

    pinoLogger.error(
      this.formatMeta({
        ...meta,
        stack: error.stack,
        error: error.message,
        errorName: error.name,
      }),
    );
  }

  public warn(meta: TMeta) {
    pinoLogger.warn(this.formatMeta(meta));
  }

  public debug(meta: TMeta) {
    pinoLogger.debug(this.formatMeta(meta));
  }
}