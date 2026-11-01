import {
  Get,
  Body,
  Post,
  Patch,
  Param,
  Query,
  Delete,
  HttpCode,
  HttpStatus,
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
import { ProjectDriveService } from './project-drive.service';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { DriveFileParamsDto } from './dto/drive-file-params.dto';
import type { IDriveItem } from '@Interfaces/google-drive.interface';
import { ApiTags, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { DRIVE_UPLOAD_POLICY } from '@Constants/drive-upload.constant';
import { IProjectDriveContents } from './interfaces/project-drive.interface';
import type { IProject } from '@Modules/project/interfaces/project.interface';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';
import { UploadCleanupInterceptor } from '../../interceptors/upload-cleanup.interceptor';
import { IDriveConnectionResult } from '@Providers/google-drive/interfaces/drive-connection.interface';

@ApiTags('project-drive')
@ApiBearerAuth()
@Controller('project-drive')
export class ProjectDriveController {
  constructor(private readonly projectDriveService: ProjectDriveService) {}

  @Get('upload-policy')
  @RequirePermissions(PERMISSIONS.DRIVE_READ)
  getUploadPolicy() {
    return DRIVE_UPLOAD_POLICY;
  }

  @Get('connection')
  @RequirePermissions(PERMISSIONS.DRIVE_CONNECTION_CHECK)
  checkConnection(): Promise<IDriveConnectionResult> {
    return this.projectDriveService.checkConnection();
  }

  @Get(':projectId/contents')
  @RequirePermissions(PERMISSIONS.DRIVE_READ)
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
    UploadCleanupInterceptor,
  )
  @RequirePermissions(PERMISSIONS.DRIVE_UPLOAD)
  upload(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() folder: DriveFolderDto,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<IDriveItem[]> {
    return this.projectDriveService.upload(projectId, folder, files ?? []);
  }

  @Patch(':projectId/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.DRIVE_MOVE)
  moveFile(
    @Param() params: DriveFileParamsDto,
    @Body() folder: DriveFolderDto,
  ): Promise<void> {
    return this.projectDriveService.moveFile(
      params.projectId,
      params.fileId,
      folder,
    );
  }

  @Delete(':projectId/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.DRIVE_DELETE)
  trashFile(@Param() params: DriveFileParamsDto): Promise<void> {
    return this.projectDriveService.trashFile(params.projectId, params.fileId);
  }

  @Post(':projectId/provision')
  @RequirePermissions(PERMISSIONS.DRIVE_PROVISION)
  provision(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<IProject> {
    return this.projectDriveService.provision(projectId);
  }
}
