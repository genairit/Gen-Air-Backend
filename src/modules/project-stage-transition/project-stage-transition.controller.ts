import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { Get, Param, Controller, ParseUUIDPipe } from '@nestjs/common';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';
import { ProjectStageTransitionService } from './project-stage-transition.service';
import { IProjectStageTransition } from './interfaces/project-stage-transition.interface';

@ApiTags('project-stage-transition')
@ApiBearerAuth()
@Controller('project-stage-transition')
export class ProjectStageTransitionController {
  constructor(
    private readonly projectStageTransitionService: ProjectStageTransitionService,
  ) {}

  @Get('by-project/:projectId')
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  getByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<IProjectStageTransition[]> {
    return this.projectStageTransitionService.getByProject(projectId);
  }
}
