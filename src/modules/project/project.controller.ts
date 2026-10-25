import {
  Get,
  Body,
  Post,
  Param,
  Patch,
  Query,
  Delete,
  HttpCode,
  HttpStatus,
  Controller,
  ParseUUIDPipe,
} from '@nestjs/common';

import {
  IProject,
  IApartmentPage,
  IProjectStageCounts,
} from './interfaces/project.interface';

import { ProjectService } from './project.service';
import { MoveProjectDto } from './dto/move-project.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { CreateApartmentDto } from './dto/create-apartment.dto';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { GetProjectsByFilterDto } from './dto/get-by-filter.dto';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { GetProjectCountsByFilterDto } from './dto/get-counts-by-filter.dto';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import { GetApartmentsByFilterDto } from './dto/get-apartments-by-filter.dto';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@ApiTags('project')
@ApiBearerAuth()
@Controller('project')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  getByFilter(
    @Query() filter: GetProjectsByFilterDto,
  ): Promise<ICursorPage<IProject>> {
    return this.projectService.getByFilter(filter);
  }

  @Get('stage-counts')
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  getStageCounts(
    @Query() filter: GetProjectCountsByFilterDto,
  ): Promise<IProjectStageCounts> {
    return this.projectService.getStageCounts(filter);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<IProject> {
    return this.projectService.getById(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROJECTS_CREATE)
  create(
    @Body() project: CreateProjectDto,
    @AuthenticatedUser() creator: IUser,
  ): Promise<IProject> {
    return this.projectService.create(project, creator);
  }

  @Get(':id/apartments/stage-counts')
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  getApartmentStageCounts(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IProjectStageCounts> {
    return this.projectService.getApartmentStageCounts(id);
  }

  @Get(':id/apartments')
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  getApartments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() filter: GetApartmentsByFilterDto,
  ): Promise<IApartmentPage> {
    return this.projectService.getApartments(id, filter);
  }

  @Post(':id/apartments')
  @RequirePermissions(PERMISSIONS.APARTMENTS_CREATE)
  createApartment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() apartment: CreateApartmentDto,
    @AuthenticatedUser() creator: IUser,
  ): Promise<IProject> {
    return this.projectService.createApartment(id, apartment, creator);
  }

  @Patch(':id/stage')
  @RequirePermissions(PERMISSIONS.PROJECTS_STATUS_CHANGE)
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() move: MoveProjectDto,
    @AuthenticatedUser() user: IUser,
  ): Promise<IProject> {
    return this.projectService.move(id, move, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PROJECTS_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changes: UpdateProjectDto,
    @AuthenticatedUser() editor: IAuthorizedUser,
  ): Promise<IProject> {
    return this.projectService.updateForActor(id, changes, editor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PROJECTS_DELETE)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.projectService.delete(id);
  }
}
