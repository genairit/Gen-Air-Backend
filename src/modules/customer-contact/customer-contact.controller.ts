import {
  Get,
  Post,
  Body,
  Param,
  Patch,
  Controller,
  ParseUUIDPipe,
} from '@nestjs/common';

import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { CustomerContactService } from './customer-contact.service';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import { ICustomerContact } from './interfaces/customer-contact.interface';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import { CreateCustomerContactDto } from './dto/create-customer-contact.dto';
import { UpdateCustomerContactDto } from './dto/update-customer-contact.dto';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@ApiTags('customer-contact')
@ApiBearerAuth()
@Controller('customer/:customerId/contacts')
export class CustomerContactController {
  constructor(private readonly contacts: CustomerContactService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  list(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<ICustomerContact[]> {
    return this.contacts.list(customerId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_UPDATE)
  create(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() contact: CreateCustomerContactDto,
    @AuthenticatedUser() user: IUser,
  ): Promise<ICustomerContact> {
    return this.contacts.create(customerId, contact, user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_UPDATE)
  update(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changes: UpdateCustomerContactDto,
  ): Promise<ICustomerContact> {
    return this.contacts.update(customerId, id, changes);
  }
}
