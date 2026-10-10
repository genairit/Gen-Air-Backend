import { Module, forwardRef } from '@nestjs/common';
import { ProjectStageService } from './project-stage.service';
import { ProjectModule } from '@Modules/project/project.module';
import { ProjectStageController } from './project-stage.controller';
import { ProjectStageRepository } from './project-stage.repository';
import { DatabaseModule } from '@Providers/database/database.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => ProjectModule)],
  controllers: [ProjectStageController],
  providers: [ProjectStageService, ProjectStageRepository],
  exports: [ProjectStageService],
})
export class ProjectStageModule {}
