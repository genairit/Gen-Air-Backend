import {
  Get,
  Body,
  Post,
  Patch,
  Param,
  Query,
  Controller,
  ParseUUIDPipe,
} from '@nestjs/common';

import {
  MaterialQueryDto,
  CreateMaterialDto,
  UpdateMaterialDto,
} from './dto/material.dto';

import { MaterialService } from './material.service';
import { PERMISSIONS } from '@Constants/authorization.constant';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@Controller('material')
export class MaterialController {
  constructor(private readonly service: MaterialService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  search(
    @Query() query: MaterialQueryDto,
  ): ReturnType<MaterialService['search']> {
    return this.service.search(query);
  }
  @Get(':id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  get(
    @Param('id', ParseUUIDPipe) id: string,
  ): ReturnType<MaterialService['get']> {
    return this.service.get(id);
  }
  @Post()
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  create(
    @Body() values: CreateMaterialDto,
  ): ReturnType<MaterialService['create']> {
    return this.service.create(values);
  }
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changes: UpdateMaterialDto,
    @AuthenticatedUser() user: IUser,
  ): ReturnType<MaterialService['update']> {
    return this.service.update(id, changes, user.id);
  }
}
