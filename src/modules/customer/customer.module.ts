import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { CustomerRepository } from './customer.repository';
import { DatabaseModule } from '@Providers/database/database.module';
import { CustomerOwnContactService } from './customer-own-contact.service';
import { CustomerProjectLinkService } from './customer-project-link.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CustomerController],
  providers: [
    CustomerService,
    CustomerRepository,
    CustomerProjectLinkService,
    CustomerOwnContactService,
  ],
  exports: [CustomerService],
})
export class CustomerModule {}
