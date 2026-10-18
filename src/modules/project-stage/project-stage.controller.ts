import { Get, Controller } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectStageService } from './project-stage.service';
import { IProjectStage } from './interfaces/project-stage.interface';

@ApiTags('project-stage')
@ApiBearerAuth()
@Controller('project-stage')
export class ProjectStageController {
  constructor(private readonly projectStageService: ProjectStageService) {}

  @Get()
  getAll(): Promise<IProjectStage[]> {
    return this.projectStageService.getAll();
  }
}
