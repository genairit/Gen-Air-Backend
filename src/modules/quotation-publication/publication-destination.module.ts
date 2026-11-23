import { Module } from '@nestjs/common';
import { PublicationRepository } from './publication.repository';
import { DatabaseModule } from '@Providers/database/database.module';
import { GoogleDriveModule } from '@Providers/google-drive/google-drive.module';
import { PublicationDestinationService } from './publication-destination.service';

@Module({
  imports: [DatabaseModule, GoogleDriveModule],
  providers: [PublicationRepository, PublicationDestinationService],
  exports: [PublicationRepository, PublicationDestinationService],
})
export class PublicationDestinationModule {}
