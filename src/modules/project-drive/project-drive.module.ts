import { Module } from '@nestjs/common';
import { ProjectDriveService } from './project-drive.service';
import { ProjectModule } from '@Modules/project/project.module';
import { ProjectDriveController } from './project-drive.controller';
import { GoogleDriveModule } from '@Providers/google-drive/google-drive.module';
import { DriveTemplateFolderModule } from '@Modules/drive-template-folder/drive-template-folder.module';
import { PublicationDestinationModule } from '@Modules/quotation-publication/publication-destination.module';

@Module({
  imports: [
    ProjectModule,
    GoogleDriveModule,
    DriveTemplateFolderModule,
    PublicationDestinationModule,
  ],
  controllers: [ProjectDriveController],
  providers: [ProjectDriveService],
  exports: [ProjectDriveService],
})
export class ProjectDriveModule {}
