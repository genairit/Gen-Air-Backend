import { Module } from '@nestjs/common';
import { CustomerContactService } from './customer-contact.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { CustomerContactRepository } from './customer-contact.repository';
import { ContactDirectoryController } from './contact-directory.controller';

@Module({
  imports: [DatabaseModule],
  providers: [CustomerContactService, CustomerContactRepository],
  controllers: [ContactDirectoryController],
  exports: [CustomerContactService],
})
export class CustomerContactModule {}
