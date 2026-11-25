import { ConfigModule } from '@nestjs/config';
import { environmentSchema } from './environment.schema';

export const EnvironmentModule = ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: environmentSchema,
});
