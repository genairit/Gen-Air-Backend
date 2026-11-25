import { Module } from '@nestjs/common';
import { ProjectDocumentService } from './project-document.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { ProjectDocumentRepository } from './project-document.repository';
import { ProjectDriveModule } from '@Modules/project-drive/project-drive.module';

@Module({
  imports: [DatabaseModule, ProjectDriveModule],
  providers: [ProjectDocumentService, ProjectDocumentRepository],
  exports: [ProjectDocumentService],
})
export class ProjectDocumentModule {}
