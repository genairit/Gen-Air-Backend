import { Get, Controller } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectTypeService } from './project-type.service';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { IProjectType } from './interfaces/project-type.interface';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@ApiTags('project-type')
@ApiBearerAuth()
@Controller('project-type')
export class ProjectTypeController {
  constructor(private readonly projectTypeService: ProjectTypeService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  getAll(): Promise<IProjectType[]> {
    return this.projectTypeService.getAll();
  }
}
