import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { TaskRepository } from './task.repository';
import { UserModule } from '@Modules/user/user.module';
import { ProjectModule } from '@Modules/project/project.module';
import { CustomerModule } from '@Modules/customer/customer.module';
import { DatabaseModule } from '@Providers/database/database.module';

@Module({
  imports: [DatabaseModule, ProjectModule, CustomerModule, UserModule],
  controllers: [TaskController],
  providers: [TaskService, TaskRepository],
  exports: [TaskService],
})
export class TaskModule {}
