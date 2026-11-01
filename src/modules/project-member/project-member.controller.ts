import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ProjectMemberService } from './project-member.service';
import { Get, Param, Controller, ParseUUIDPipe } from '@nestjs/common';
import { IProjectMember } from './interfaces/project-member.interface';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@ApiTags('project-member')
@ApiBearerAuth()
@Controller('project-member')
export class ProjectMemberController {
  constructor(private readonly projectMemberService: ProjectMemberService) {}

  @Get('by-project/:projectId')
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  getByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<IProjectMember[]> {
    return this.projectMemberService.getByProject(projectId);
  }
}
