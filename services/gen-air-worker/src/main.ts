import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { TypedLogger } from './logger/logger.service.js';
import { QueueService } from './modules/worker/queue.service.js';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();
  try {
    await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
    await app.get(QueueService).waitForFailure();
    process.exitCode = 1;
  } finally {
    await app.close();
  }
};

try {
  await bootstrap();
} catch {
  new TypedLogger('Bootstrap').error({
    message:
      'Worker startup failed; verify configuration and broker availability',
  });
  process.exitCode = 1;
}
