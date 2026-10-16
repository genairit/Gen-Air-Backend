import { Module } from '@nestjs/common';
import { ProjectStageService } from './project-stage.service';
import { ProjectStageController } from './project-stage.controller';
import { ProjectStageRepository } from './project-stage.repository';
import { DatabaseModule } from '@Providers/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ProjectStageController],
  providers: [ProjectStageService, ProjectStageRepository],
  exports: [ProjectStageService],
})
export class ProjectStageModule {}
