import * as Joi from 'joi';
import { ConfigModule } from '@nestjs/config';
import { JENNY_SETTINGS } from '@Modules/jenny/constants/jenny.constant';

const environmentSchema = Joi.object({
  DB_USER: Joi.string().required(),
  DB_HOST: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_PASS: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  JWT_SECRET: Joi.string().required(),
  AUTH_CLIENT_SECRET: Joi.string().min(32).required(),
  WORKER_URL: Joi.string().uri().optional(),
  WORKER_API_TOKEN: Joi.string().min(32).optional(),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: Joi.string().optional(),
  GOOGLE_PLACES_API_KEY: Joi.string().optional(),
  GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: Joi.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: Joi.string().optional(),
  OPENAI_API_KEY: Joi.string().optional(),
  JENNY_MODEL: Joi.string().default(JENNY_SETTINGS.DEFAULT_MODEL),
  JENNY_MAX_TOOL_ROUNDS: Joi.number()
    .integer()
    .min(JENNY_SETTINGS.MIN_TOOL_ROUNDS)
    .max(JENNY_SETTINGS.MAX_TOOL_ROUNDS)
    .default(JENNY_SETTINGS.DEFAULT_MAX_TOOL_ROUNDS),
});

export const EnvironmentModule = ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: environmentSchema,
});
