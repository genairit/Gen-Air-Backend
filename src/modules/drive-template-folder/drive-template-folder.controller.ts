import {
  Get,
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

import {
  IDriveTemplateFolder,
  IDriveTemplateFolderNode,
} from './interfaces/drive-template-folder.interface';

import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRoles } from '@Decorators/user-roles.decorator';
import { ROLE_PERMISSIONS } from '@Constants/authorization.constant';
import { DriveTemplateFolderService } from './drive-template-folder.service';
import { CreateDriveTemplateFolderDto } from './dto/create-drive-template-folder.dto';
import { UpdateDriveTemplateFolderDto } from './dto/update-drive-template-folder.dto';

@ApiTags('drive-template-folder')
@ApiBearerAuth()
@Controller('drive-template-folder')
export class DriveTemplateFolderController {
  constructor(
    private readonly driveTemplateFolderService: DriveTemplateFolderService,
  ) {}

  @Get()
  getTree(): Promise<IDriveTemplateFolderNode[]> {
    return this.driveTemplateFolderService.getTree();
  }

  @Post()
  @UserRoles(ROLE_PERMISSIONS.MANAGE_SETTINGS)
  create(
    @Body() folder: CreateDriveTemplateFolderDto,
  ): Promise<IDriveTemplateFolder> {
    return this.driveTemplateFolderService.create(folder);
  }

  @Patch(':id')
  @UserRoles(ROLE_PERMISSIONS.MANAGE_SETTINGS)
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changes: UpdateDriveTemplateFolderDto,
  ): Promise<IDriveTemplateFolder> {
    return this.driveTemplateFolderService.rename(id, changes);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UserRoles(ROLE_PERMISSIONS.MANAGE_SETTINGS)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.driveTemplateFolderService.delete(id);
  }
}
