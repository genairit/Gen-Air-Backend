import pino from 'pino';

interface ILogMeta {
  jobId?: string;
  message: string;
  status?: string;
  attempt?: number;
}

const logger = pino();

export class TypedLogger {
  constructor(private readonly context: string) {}

  info = (meta: ILogMeta): void =>
    logger.info({ context: this.context, ...meta });
  warn = (meta: ILogMeta): void =>
    logger.warn({ context: this.context, ...meta });
  error = (meta: ILogMeta): void =>
    logger.error({ context: this.context, ...meta });
}
