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
import { UserRoles } from '@Decorators/user-roles.decorator';
import { CreateApartmentDto } from './dto/create-apartment.dto';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { GetProjectsByFilterDto } from './dto/get-by-filter.dto';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import { ROLE_PERMISSIONS } from '@Constants/authorization.constant';
import { GetProjectCountsByFilterDto } from './dto/get-counts-by-filter.dto';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import { GetApartmentsByFilterDto } from './dto/get-apartments-by-filter.dto';

@ApiTags('project')
@ApiBearerAuth()
@Controller('project')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  getByFilter(
    @Query() filter: GetProjectsByFilterDto,
  ): Promise<ICursorPage<IProject>> {
    return this.projectService.getByFilter(filter);
  }

  @Get('stage-counts')
  getStageCounts(
    @Query() filter: GetProjectCountsByFilterDto,
  ): Promise<IProjectStageCounts> {
    return this.projectService.getStageCounts(filter);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<IProject> {
    return this.projectService.getById(id);
  }

  @Post()
  @UserRoles(ROLE_PERMISSIONS.EDIT_PROJECTS)
  create(
    @Body() project: CreateProjectDto,
    @AuthenticatedUser() creator: IUser,
  ): Promise<IProject> {
    return this.projectService.create(project, creator);
  }

  @Get(':id/apartments/stage-counts')
  getApartmentStageCounts(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IProjectStageCounts> {
    return this.projectService.getApartmentStageCounts(id);
  }

  @Get(':id/apartments')
  getApartments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() filter: GetApartmentsByFilterDto,
  ): Promise<IApartmentPage> {
    return this.projectService.getApartments(id, filter);
  }

  @Post(':id/apartments')
  @UserRoles(ROLE_PERMISSIONS.EDIT_PROJECTS)
  createApartment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() apartment: CreateApartmentDto,
    @AuthenticatedUser() creator: IUser,
  ): Promise<IProject> {
    return this.projectService.createApartment(id, apartment, creator);
  }

  @Patch(':id/stage')
  @UserRoles(ROLE_PERMISSIONS.MOVE_PROJECT_STAGE)
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() move: MoveProjectDto,
    @AuthenticatedUser() user: IUser,
  ): Promise<IProject> {
    return this.projectService.move(id, move, user);
  }

  @Patch(':id')
  @UserRoles(ROLE_PERMISSIONS.EDIT_PROJECTS)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changes: UpdateProjectDto,
    @AuthenticatedUser() editor: IUser,
  ): Promise<IProject> {
    return this.projectService.update(id, changes, editor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UserRoles(ROLE_PERMISSIONS.DELETE_PROJECTS)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.projectService.delete(id);
  }
}
