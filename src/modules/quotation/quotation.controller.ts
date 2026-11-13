import {
  Get,
  Put,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Controller,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';

import {
  SaveQuotationDto,
  CreateQuotationDto,
  CancelQuotationDto,
  UpdateSalesAgentDto,
  QuotationTransitionDto,
  AcknowledgeWarningsDto,
  QuotationCancellationDto,
} from './dto/save-quotation.dto';

import { Query } from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { GetQuotationsDto } from './dto/get-quotations.dto';
import { CloneQuotationDto } from './dto/clone-quotation.dto';
import { QuotationPdfService } from './quotation-pdf.service';
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
  constructor(
    private readonly service: QuotationService,
    private readonly pdf: QuotationPdfService,
  ) {}
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
  @Get('sales-agents')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_READ, PERMISSIONS.EMPLOYEES_READ)
  salesAgents(): ReturnType<QuotationService['salesAgents']> {
    return this.service.salesAgents();
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
  @Post(':id/pdf')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.QUOTATIONS_EXPORT, PERMISSIONS.PROJECTS_READ)
  async exportPdf(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { filename, pdf } = await this.pdf.export(id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
  }
  @Post()
  @RequirePermissions(PERMISSIONS.QUOTATIONS_CREATE)
  async create(
    @Body()
    input: CreateQuotationDto,
    @AuthenticatedUser()
    user: IAuthorizedUser,
  ): ReturnType<QuotationService['create']> {
    const quotation = await this.service.create(input, user);
    return this.service.projectDetailsForActor(quotation, user);
  }
  @Post(':id/clone')
  @RequirePermissions(
    PERMISSIONS.QUOTATIONS_READ,
    PERMISSIONS.QUOTATIONS_CREATE,
    PERMISSIONS.PROJECTS_READ,
  )
  async clone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CloneQuotationDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): ReturnType<QuotationService['clone']> {
    const quotation = await this.service.clone(id, input, user);
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
    const quotation = await this.service.save(id, input, user);
    return this.service.projectDetailsForActor(quotation, user);
  }
  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_UPDATE)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CancelQuotationDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): ReturnType<QuotationService['cancel']> {
    const quotation = await this.service.cancel(id, input, user);
    return this.service.projectDetailsForActor(quotation, user);
  }
  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_UPDATE)
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: QuotationCancellationDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): ReturnType<QuotationService['restore']> {
    const quotation = await this.service.restore(id, input, user);
    return this.service.projectDetailsForActor(quotation, user);
  }
  @Patch(':id/sales-agent')
  @RequirePermissions(PERMISSIONS.QUOTATIONS_UPDATE)
  async updateSalesAgent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateSalesAgentDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): ReturnType<QuotationService['updateSalesAgent']> {
    const quotation = await this.service.updateSalesAgent(id, input, user);
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
