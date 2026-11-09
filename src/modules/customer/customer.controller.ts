import {
  Get,
  Post,
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
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { GetCustomersByFilterDto } from './dto/get-by-filter.dto';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import type { ILinkableProject } from './customer-project-link.service';
import { LinkCustomerProjectsDto } from './dto/link-customer-projects.dto';
import { CustomerProjectLinkService } from './customer-project-link.service';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';
import { SetCustomerPrimaryContactDto } from './dto/set-customer-primary-contact.dto';

@ApiTags('customer')
@ApiBearerAuth()
@Controller('customer')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly projectLinks: CustomerProjectLinkService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  getByFilter(
    @Query() filter: GetCustomersByFilterDto,
  ): Promise<ICursorPage<ICustomer>> {
    return this.customerService.getByFilter(filter);
  }

  @Get('sync-status-counts')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  getSyncStatusCounts(): Promise<TCustomerSyncStatusCounts> {
    return this.customerService.getSyncStatusCounts();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<ICustomer> {
    return this.customerService.getById(id);
  }

  @Get(':id/linkable-projects')
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  searchLinkableProjects(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('search') search = '',
  ): Promise<ILinkableProject[]> {
    return this.projectLinks.search(id, search);
  }

  @Post(':id/projects')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PROJECTS_UPDATE)
  linkProjects(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: LinkCustomerProjectsDto,
  ): Promise<void> {
    return this.projectLinks.link(id, input);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_CREATE)
  create(
    @Body() customer: CreateCustomerDto,
    @AuthenticatedUser() user: IUser,
  ): Promise<ICustomer> {
    return this.customerService.create(customer, user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changes: UpdateCustomerDto,
  ): Promise<ICustomer> {
    return this.customerService.update(id, changes);
  }

  @Patch(':id/primary-contact')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_UPDATE)
  setPrimaryContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: SetCustomerPrimaryContactDto,
  ): Promise<ICustomer> {
    return this.customerService.setPrimaryContact(id, input.contactId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.CUSTOMERS_DELETE)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.customerService.delete(id);
  }
}
