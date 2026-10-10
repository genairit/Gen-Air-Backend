import {
  Get,
  Put,
  Body,
  Post,
  Param,
  Patch,
  Delete,
  HttpCode,
  HttpStatus,
  Controller,
  ParseUUIDPipe,
} from '@nestjs/common';

import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRoles } from '@Decorators/user-roles.decorator';
import { ProjectStageService } from './project-stage.service';
import { IProjectStage } from './interfaces/project-stage.interface';
import { ROLE_PERMISSIONS } from '@Constants/authorization.constant';
import { CreateProjectStageDto } from './dto/create-project-stage.dto';
import { UpdateProjectStageDto } from './dto/update-project-stage.dto';
import { ReorderProjectStagesDto } from './dto/reorder-project-stage.dto';

@ApiTags('project-stage')
@ApiBearerAuth()
@Controller('project-stage')
export class ProjectStageController {
  constructor(private readonly projectStageService: ProjectStageService) {}

  @Get()
  getAll(): Promise<IProjectStage[]> {
    return this.projectStageService.getAll();
  }

  @Post()
  @UserRoles(ROLE_PERMISSIONS.MANAGE_SETTINGS)
  create(@Body() stage: CreateProjectStageDto): Promise<IProjectStage> {
    return this.projectStageService.create(stage);
  }

  @Put('order')
  @UserRoles(ROLE_PERMISSIONS.MANAGE_SETTINGS)
  reorder(@Body() order: ReorderProjectStagesDto): Promise<IProjectStage[]> {
    return this.projectStageService.reorder(order);
  }

  @Patch(':id')
  @UserRoles(ROLE_PERMISSIONS.MANAGE_SETTINGS)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changes: UpdateProjectStageDto,
  ): Promise<IProjectStage> {
    return this.projectStageService.update(id, changes);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UserRoles(ROLE_PERMISSIONS.MANAGE_SETTINGS)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.projectStageService.delete(id);
  }
}
