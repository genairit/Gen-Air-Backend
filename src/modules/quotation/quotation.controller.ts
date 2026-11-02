import {
  Get,
  Put,
  Post,
  Body,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Controller,
  ParseUUIDPipe,
} from '@nestjs/common';

import {
  SaveQuotationDto,
  CreateQuotationDto,
  QuotationTransitionDto,
  AcknowledgeWarningsDto,
} from './dto/save-quotation.dto';

import { Query } from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { GetQuotationsDto } from './dto/get-quotations.dto';
import { DeleteQuotationDto } from './dto/delete-quotation.dto';
import { PERMISSIONS } from '@Constants/authorization.constant';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import { GetQuotationCountsDto } from './dto/get-quotation-counts.dto';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@Controller('quotation')
export class QuotationController {
  constructor(private readonly service: QuotationService) {}
  @Get()
  @RequirePermissions(PERMISSIONS.QUOTATIONS_READ)
  list(
    @Query()
    query: GetQuotationsDto,
  ): ReturnType<QuotationService['list']> {
    return this.service.list(query);
  }
  @Get('status-counts')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_READ)
  statusCounts(
    @Query() query: GetQuotationCountsDto,
  ): ReturnType<QuotationService['statusCounts']> {
    return this.service.statusCounts(query);
  }
  @Get(':id')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_READ)
  get(
    @Param('id', ParseUUIDPipe)
    id: string,
  ): ReturnType<QuotationService['getById']> {
    return this.service.getById(id);
  }
  @Post()
  @RequirePermissions(PERMISSIONS.QUOTATIONS_CREATE)
  create(
    @Body()
    input: CreateQuotationDto,
    @AuthenticatedUser()
    user: IUser,
  ): ReturnType<QuotationService['create']> {
    return this.service.create(input, user.id);
  }
  @Put(':id')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_UPDATE)
  save(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body()
    input: SaveQuotationDto,
    @AuthenticatedUser()
    user: IUser,
  ): ReturnType<QuotationService['save']> {
    return this.service.save(id, input, user.id);
  }
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.QUOTATIONS_DELETE)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: DeleteQuotationDto,
    @AuthenticatedUser() user: IUser,
  ): Promise<void> {
    return this.service.delete(id, input, user.id);
  }
  @Post(':id/review')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_APPROVE)
  transition(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body()
    input: QuotationTransitionDto,
    @AuthenticatedUser()
    user: IUser,
  ): ReturnType<QuotationService['transition']> {
    return this.service.transition(id, input, user.id);
  }
  @Post(':id/warnings')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_APPROVE)
  acknowledge(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body()
    input: AcknowledgeWarningsDto,
    @AuthenticatedUser()
    user: IUser,
  ): ReturnType<QuotationService['acknowledge']> {
    return this.service.acknowledge(id, input, user.id);
  }
}
