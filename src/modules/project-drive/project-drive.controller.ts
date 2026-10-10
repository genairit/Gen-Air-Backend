import {
  Get,
  Post,
  Param,
  Query,
  Controller,
  UploadedFiles,
  ParseUUIDPipe,
  UseInterceptors,
} from '@nestjs/common';

import {
  UPLOAD_LIMITS,
  UPLOAD_OPTIONS,
} from './constants/project-drive.constant';

import { DriveFolderDto } from './dto/drive-folder.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UserRoles } from '@Decorators/user-roles.decorator';
import { ProjectDriveService } from './project-drive.service';
import type { IDriveItem } from '@Interfaces/google-drive.interface';
import { ROLE_PERMISSIONS } from '@Constants/authorization.constant';
import { ApiTags, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { IProjectDriveContents } from './interfaces/project-drive.interface';
import type { IProject } from '@Modules/project/interfaces/project.interface';

@ApiTags('project-drive')
@ApiBearerAuth()
@Controller('project-drive')
export class ProjectDriveController {
  constructor(private readonly projectDriveService: ProjectDriveService) {}

  @Get(':projectId/contents')
  getContents(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() folder: DriveFolderDto,
  ): Promise<IProjectDriveContents> {
    return this.projectDriveService.getContents(projectId, folder);
  }

  @Post(':projectId/files')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor(
      UPLOAD_LIMITS.FIELD_NAME,
      UPLOAD_LIMITS.MAX_FILES,
      UPLOAD_OPTIONS,
    ),
  )
  upload(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() folder: DriveFolderDto,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<IDriveItem[]> {
    return this.projectDriveService.upload(projectId, folder, files ?? []);
  }

  @Post(':projectId/provision')
  @UserRoles(ROLE_PERMISSIONS.EDIT_PROJECTS)
  provision(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<IProject> {
    return this.projectDriveService.provision(projectId);
  }
}
