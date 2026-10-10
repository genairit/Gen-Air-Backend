import { Module } from '@nestjs/common';
import { ProjectDriveService } from './project-drive.service';
import { ProjectModule } from '@Modules/project/project.module';
import { ProjectDriveController } from './project-drive.controller';
import { GoogleDriveModule } from '@Providers/google-drive/google-drive.module';
import { DriveTemplateFolderModule } from '@Modules/drive-template-folder/drive-template-folder.module';

@Module({
  imports: [ProjectModule, GoogleDriveModule, DriveTemplateFolderModule],
  controllers: [ProjectDriveController],
  providers: [ProjectDriveService],
})
export class ProjectDriveModule {}
