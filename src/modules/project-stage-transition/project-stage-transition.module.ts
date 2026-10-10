import { Module } from '@nestjs/common';
import { DatabaseModule } from '@Providers/database/database.module';
import { ProjectStageTransitionService } from './project-stage-transition.service';
import { ProjectStageTransitionController } from './project-stage-transition.controller';
import { ProjectStageTransitionRepository } from './project-stage-transition.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [ProjectStageTransitionController],
  providers: [ProjectStageTransitionService, ProjectStageTransitionRepository],
  exports: [ProjectStageTransitionService],
})
export class ProjectStageTransitionModule {}
