import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { TaskDataModule } from './task-data.module';
import { UserModule } from '@Modules/user/user.module';
import { ProjectModule } from '@Modules/project/project.module';
import { DatabaseModule } from '@Providers/database/database.module';

@Module({
  imports: [DatabaseModule, TaskDataModule, ProjectModule, UserModule],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
