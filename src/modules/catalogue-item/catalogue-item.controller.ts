import {
  Get,
  Body,
  Patch,
  Param,
  Query,
  Controller,
  ParseUUIDPipe,
} from '@nestjs/common';

import {
  CatalogueQueryDto,
  CatalogueUpdateDto,
} from './dto/catalogue-query.dto';

import { PERMISSIONS } from '@Constants/authorization.constant';
import { CatalogueItemService } from './catalogue-item.service';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';
import { GetCatalogueMaintenanceDto } from './dto/get-catalogue-maintenance.dto';

@Controller('catalogue-item')
export class CatalogueItemController {
  constructor(private readonly service: CatalogueItemService) {}
  @Get()
  @RequirePermissions(PERMISSIONS.QUOTATIONS_READ)
  search(
    @Query()
    query: CatalogueQueryDto,
    @AuthenticatedUser()
    user: IUser,
  ): ReturnType<CatalogueItemService['search']> {
    return this.service.search(query, user.id);
  }
  @Get('maintenance')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  maintenance(
    @Query()
    query: GetCatalogueMaintenanceDto,
  ): ReturnType<CatalogueItemService['listForMaintenance']> {
    return this.service.listForMaintenance(query);
  }
  @Get(':id')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_READ)
  get(
    @Param('id', ParseUUIDPipe)
    id: string,
  ): ReturnType<CatalogueItemService['getById']> {
    return this.service.getById(id);
  }
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  update(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body()
    changes: CatalogueUpdateDto,
  ): ReturnType<CatalogueItemService['update']> {
    return this.service.update(id, changes);
  }
}
