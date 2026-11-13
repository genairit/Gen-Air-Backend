import {
  Get,
  Body,
  Post,
  Param,
  Patch,
  Query,
  Controller,
  ParseIntPipe,
  ParseUUIDPipe,
} from '@nestjs/common';

import {
  AddProjectBoqLineDto,
  PreviewProjectBoqDto,
  GenerateProjectBoqDto,
  UpdateProjectBoqLineDto,
} from './dto/project-boq.dto';

import { ProjectBoqService } from './project-boq.service';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { MaterialQueryDto } from '@Modules/material/dto/material.dto';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@Controller('project-boq')
export class ProjectBoqController {
  constructor(private readonly service: ProjectBoqService) {}

  @Get('materials')
  @RequirePermissions(PERMISSIONS.PROJECT_BOQ_READ)
  materials(
    @Query() query: MaterialQueryDto,
  ): ReturnType<ProjectBoqService['materialsSearch']> {
    return this.service.materialsSearch(query);
  }

  @Get(':projectId/sources')
  @RequirePermissions(PERMISSIONS.PROJECT_BOQ_READ)
  sources(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): ReturnType<ProjectBoqService['sources']> {
    return this.service.sources(projectId);
  }

  @Get(':projectId')
  @RequirePermissions(PERMISSIONS.PROJECT_BOQ_READ)
  get(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): ReturnType<ProjectBoqService['get']> {
    return this.service.get(projectId);
  }

  @Get(':projectId/revisions/:revision')
  @RequirePermissions(PERMISSIONS.PROJECT_BOQ_READ)
  revision(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('revision', ParseIntPipe) revision: number,
  ): ReturnType<ProjectBoqService['revision']> {
    return this.service.revision(projectId, revision);
  }

  @Get(':projectId/preview')
  @RequirePermissions(PERMISSIONS.PROJECT_BOQ_READ)
  preview(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: PreviewProjectBoqDto,
  ): ReturnType<ProjectBoqService['preview']> {
    return this.service.preview(projectId, query.quotationId);
  }

  @Post(':projectId/generate')
  @RequirePermissions(PERMISSIONS.PROJECT_BOQ_MANAGE)
  generate(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() input: GenerateProjectBoqDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): ReturnType<ProjectBoqService['generate']> {
    return this.service.generate(projectId, input, user.id);
  }

  @Patch(':projectId/lines/:lineId')
  @RequirePermissions(PERMISSIONS.PROJECT_BOQ_MANAGE)
  updateLine(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() input: UpdateProjectBoqLineDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): ReturnType<ProjectBoqService['updateLine']> {
    return this.service.updateLine(projectId, lineId, input, user.id);
  }

  @Post(':projectId/lines')
  @RequirePermissions(PERMISSIONS.PROJECT_BOQ_MANAGE)
  addLine(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() input: AddProjectBoqLineDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): ReturnType<ProjectBoqService['addLine']> {
    return this.service.addLine(projectId, input, user.id);
  }
}
