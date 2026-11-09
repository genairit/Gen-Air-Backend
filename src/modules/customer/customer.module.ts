import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { CustomerRepository } from './customer.repository';
import { DatabaseModule } from '@Providers/database/database.module';
import { CustomerProjectLinkService } from './customer-project-link.service';
import { CustomerContactModule } from '@Modules/customer-contact/customer-contact.module';

@Module({
  imports: [DatabaseModule, CustomerContactModule],
  controllers: [CustomerController],
  providers: [CustomerService, CustomerRepository, CustomerProjectLinkService],
  exports: [CustomerService],
})
export class CustomerModule {}
