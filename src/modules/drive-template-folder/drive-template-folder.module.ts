import { Module } from '@nestjs/common';
import { DatabaseModule } from '@Providers/database/database.module';
import { DriveTemplateFolderService } from './drive-template-folder.service';
import { DriveTemplateFolderController } from './drive-template-folder.controller';
import { DriveTemplateFolderRepository } from './drive-template-folder.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [DriveTemplateFolderController],
  providers: [DriveTemplateFolderService, DriveTemplateFolderRepository],
  exports: [DriveTemplateFolderService],
})
export class DriveTemplateFolderModule {}
