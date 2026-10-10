import { Get, Controller } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectTypeService } from './project-type.service';
import { IProjectType } from './interfaces/project-type.interface';

@ApiTags('project-type')
@ApiBearerAuth()
@Controller('project-type')
export class ProjectTypeController {
  constructor(private readonly projectTypeService: ProjectTypeService) {}

  @Get()
  getAll(): Promise<IProjectType[]> {
    return this.projectTypeService.getAll();
  }
}
