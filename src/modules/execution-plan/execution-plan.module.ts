import { Module } from '@nestjs/common';
import { ExecutionPlanService } from './execution-plan.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { ExecutionPlanRepository } from './execution-plan.repository';
import { ExecutionPlanController } from './execution-plan.controller';
import { ProjectDriveModule } from '@Modules/project-drive/project-drive.module';

@Module({
  imports: [DatabaseModule, ProjectDriveModule],
  controllers: [ExecutionPlanController],
  providers: [ExecutionPlanService, ExecutionPlanRepository],
  exports: [ExecutionPlanService],
})
export class ExecutionPlanModule {}
