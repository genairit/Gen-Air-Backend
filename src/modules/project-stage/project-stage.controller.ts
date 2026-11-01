import { Get, Controller } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectStageService } from './project-stage.service';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { IProjectStage } from './interfaces/project-stage.interface';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@ApiTags('project-stage')
@ApiBearerAuth()
@Controller('project-stage')
export class ProjectStageController {
  constructor(private readonly projectStageService: ProjectStageService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  getAll(): Promise<IProjectStage[]> {
    return this.projectStageService.getAll();
  }
}
