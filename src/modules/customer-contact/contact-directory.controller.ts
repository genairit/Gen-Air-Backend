import {
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
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

@ApiTags('contact-directory')
@ApiBearerAuth()
@Controller('contact-directory')
export class ContactDirectoryController {
  constructor(private readonly contacts: CustomerContactService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  search(@Query('search') search = ''): Promise<ICustomerContact[]> {
    return this.contacts.searchDirectory(search);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROJECTS_UPDATE)
  create(
    @Body() input: CreateCustomerContactDto,
    @AuthenticatedUser() user: IUser,
  ): Promise<ICustomerContact> {
    return this.contacts.createDirectory(input, user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changes: UpdateCustomerContactDto,
  ): Promise<ICustomerContact> {
    return this.contacts.updateDirectory(id, changes);
  }
}
