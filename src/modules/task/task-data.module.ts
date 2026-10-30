import { Module } from '@nestjs/common';
import { TaskRepository } from './task.repository';
import { DatabaseModule } from '@Providers/database/database.module';
import { TaskStatusTransitionRepository } from './task-status-transition.repository';

@Module({
  imports: [DatabaseModule],
  providers: [TaskRepository, TaskStatusTransitionRepository],
  exports: [TaskRepository, TaskStatusTransitionRepository],
})
export class TaskDataModule {}
