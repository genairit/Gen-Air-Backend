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
import { SetApartmentLinksDto } from './dto/set-apartment-links.dto';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import { GetQuotationCountsDto } from './dto/get-quotation-counts.dto';
import { GetProjectQuotationsDto } from './dto/get-project-quotations.dto';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
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
  @Get('project/:projectId')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_READ, PERMISSIONS.PROJECTS_READ)
  listByProject(
    @Param('projectId', ParseUUIDPipe)
    projectId: string,
    @Query()
    query: GetProjectQuotationsDto,
  ): ReturnType<QuotationService['listByProject']> {
    return this.service.listByProject(projectId, query);
  }
  @Get(':id/apartment-options')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_READ, PERMISSIONS.PROJECTS_READ)
  apartmentOptions(
    @Param('id', ParseUUIDPipe)
    id: string,
  ): ReturnType<QuotationService['apartmentOptions']> {
    return this.service.apartmentOptions(id);
  }
  @Put(':id/apartment-links')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_UPDATE, PERMISSIONS.PROJECTS_READ)
  setApartmentLinks(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body()
    input: SetApartmentLinksDto,
  ): ReturnType<QuotationService['setApartmentLinks']> {
    return this.service.setApartmentLinks(id, input);
  }
  @Get(':id')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_READ)
  get(
    @Param('id', ParseUUIDPipe)
    id: string,
    @AuthenticatedUser()
    user: IAuthorizedUser,
  ): ReturnType<QuotationService['getForActor']> {
    return this.service.getForActor(id, user);
  }
  @Post()
  @RequirePermissions(PERMISSIONS.QUOTATIONS_CREATE)
  async create(
    @Body()
    input: CreateQuotationDto,
    @AuthenticatedUser()
    user: IAuthorizedUser,
  ): ReturnType<QuotationService['create']> {
    const quotation = await this.service.create(input, user.id);
    return this.service.projectDetailsForActor(quotation, user);
  }
  @Put(':id')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_UPDATE)
  async save(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body()
    input: SaveQuotationDto,
    @AuthenticatedUser()
    user: IAuthorizedUser,
  ): ReturnType<QuotationService['save']> {
    const quotation = await this.service.save(id, input, user.id);
    return this.service.projectDetailsForActor(quotation, user);
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
  async transition(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body()
    input: QuotationTransitionDto,
    @AuthenticatedUser()
    user: IAuthorizedUser,
  ): ReturnType<QuotationService['transition']> {
    const quotation = await this.service.transition(id, input, user.id);
    return this.service.projectDetailsForActor(quotation, user);
  }
  @Post(':id/warnings')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_APPROVE)
  async acknowledge(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body()
    input: AcknowledgeWarningsDto,
    @AuthenticatedUser()
    user: IAuthorizedUser,
  ): ReturnType<QuotationService['acknowledge']> {
    const quotation = await this.service.acknowledge(id, input, user.id);
    return this.service.projectDetailsForActor(quotation, user);
  }
}
