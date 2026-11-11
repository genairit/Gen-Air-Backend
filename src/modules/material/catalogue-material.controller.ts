import {
  Get,
  Put,
  Post,
  Body,
  Param,
  Controller,
  ParseIntPipe,
  ParseUUIDPipe,
} from '@nestjs/common';

import {
  MaterialPreviewDto,
  ReplaceMaterialLinksDto,
} from './dto/material.dto';

import { PERMISSIONS } from '@Constants/authorization.constant';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import { CatalogueMaterialService } from './catalogue-material.service';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@Controller('catalogue-item')
export class CatalogueMaterialController {
  constructor(private readonly service: CatalogueMaterialService) {}

  @Post('materials/preview')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  preview(
    @Body() values: MaterialPreviewDto,
  ): ReturnType<CatalogueMaterialService['preview']> {
    return this.service.preview(values);
  }
  @Get(':id/materials')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  getCurrent(
    @Param('id', ParseUUIDPipe) id: string,
  ): ReturnType<CatalogueMaterialService['getCurrent']> {
    return this.service.getCurrent(id);
  }
  @Get(':id/materials/revisions/:revision')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  getRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revision', ParseIntPipe) revision: number,
  ): ReturnType<CatalogueMaterialService['getRevision']> {
    return this.service.getRevision(id, revision);
  }
  @Put(':id/materials')
  @RequirePermissions(PERMISSIONS.CATALOGUE_MANAGE)
  replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() values: ReplaceMaterialLinksDto,
    @AuthenticatedUser() user: IUser,
  ): ReturnType<CatalogueMaterialService['replace']> {
    return this.service.replace(id, values, user.id);
  }
}
