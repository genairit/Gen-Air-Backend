import { Module } from '@nestjs/common';
import { WorkerModule } from './modules/worker/worker.module.js';
import { EnvironmentModule } from './providers/environment/environment.module.js';

@Module({ imports: [EnvironmentModule, WorkerModule] })
export class AppModule {}
