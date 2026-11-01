import { Module } from '@nestjs/common';
import { CustomerContactService } from './customer-contact.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { CustomerContactRepository } from './customer-contact.repository';
import { CustomerContactController } from './customer-contact.controller';

@Module({
  imports: [DatabaseModule],
  providers: [CustomerContactService, CustomerContactRepository],
  controllers: [CustomerContactController],
  exports: [CustomerContactService],
})
export class CustomerContactModule {}
