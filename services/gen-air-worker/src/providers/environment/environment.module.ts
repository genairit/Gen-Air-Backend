import Joi from 'joi';
import { ConfigModule } from '@nestjs/config';

export const EnvironmentModule = ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    PORT: Joi.number().integer().min(1).max(65535).default(3001),
    RABBITMQ_URL: Joi.string()
      .uri({ scheme: ['amqp', 'amqps'] })
      .required(),
    WORKER_QUEUE_PREFIX: Joi.string()
      .pattern(/^[a-zA-Z0-9._-]{1,100}$/)
      .default('genair.worker.v1'),
    WORKER_PREFETCH: Joi.number().integer().min(1).max(8).default(1),
  }),
});
