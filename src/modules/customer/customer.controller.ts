import {
  Get,
  Body,
  Param,
  Patch,
  Query,
  Delete,
  HttpCode,
  HttpStatus,
  Controller,
  ParseUUIDPipe,
} from '@nestjs/common';

import {
  ICustomer,
  TCustomerSyncStatusCounts,
} from './interfaces/customer.interface';

import { CustomerService } from './customer.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRoles } from '@Decorators/user-roles.decorator';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { GetCustomersByFilterDto } from './dto/get-by-filter.dto';
import { ROLE_PERMISSIONS } from '@Constants/authorization.constant';

@ApiTags('customer')
@ApiBearerAuth()
@Controller('customer')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  getByFilter(
    @Query() filter: GetCustomersByFilterDto,
  ): Promise<ICursorPage<ICustomer>> {
    return this.customerService.getByFilter(filter);
  }

  @Get('sync-status-counts')
  getSyncStatusCounts(): Promise<TCustomerSyncStatusCounts> {
    return this.customerService.getSyncStatusCounts();
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<ICustomer> {
    return this.customerService.getById(id);
  }

  @Patch(':id')
  @UserRoles(ROLE_PERMISSIONS.MANAGE_CUSTOMERS)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changes: UpdateCustomerDto,
  ): Promise<ICustomer> {
    return this.customerService.update(id, changes);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UserRoles(ROLE_PERMISSIONS.MANAGE_CUSTOMERS)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.customerService.delete(id);
  }
}
