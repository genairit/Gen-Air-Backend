import {
  Get,
  Body,
  Post,
  Param,
  Query,
  Patch,
  Header,
  HttpCode,
  Controller,
  UploadedFile,
  ParseUUIDPipe,
  StreamableFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';

import {
  EstimateSketchDto,
  EstimateVersionDto,
  EstimateLinkPlanDto,
  EstimateQuotationDto,
  EstimateUploadPlanDto,
  ListEngineeringEstimatesDto,
  CreateEngineeringEstimateDto,
  UpdateEngineeringEstimateDto,
} from './dto/engineering-estimate.dto';

import {
  ESTIMATE_LIMITS,
  ESTIMATE_PLAN_MIME,
} from './constants/engineering-estimate.constant';

import { FileInterceptor } from '@nestjs/platform-express';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { decodeUploadedFileName } from '@Utilities/upload.utility';
import type { ICursorPage } from '@Interfaces/cursor-page.interface';
import { EstimateApprovalService } from './estimate-approval.service';
import { EngineeringEstimateService } from './engineering-estimate.service';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';
import type { IEstimateView } from './interfaces/engineering-estimate.interface';
import type { IEstimateSummary } from './interfaces/engineering-estimate.interface';

const attachment = (
  content: Buffer,
  name: string,
  type: string,
): StreamableFile =>
  new StreamableFile(content, {
    type,
    disposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
  });

@Controller('engineering-estimates')
export class EngineeringEstimateController {
  constructor(
    private readonly estimates: EngineeringEstimateService,
    private readonly approval: EstimateApprovalService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ENGINEERING_ESTIMATES_READ)
  list(
    @AuthenticatedUser() actor: IAuthorizedUser,
    @Query() query: ListEngineeringEstimatesDto,
  ): Promise<ICursorPage<IEstimateSummary>> {
    return this.estimates.list(actor, query);
  }

  @Post()
  @RequirePermissions(
    PERMISSIONS.ENGINEERING_ESTIMATES_READ,
    PERMISSIONS.ENGINEERING_ESTIMATES_MANAGE,
  )
  create(
    @Body() input: CreateEngineeringEstimateDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): Promise<IEstimateView> {
    return this.estimates.create(input, actor);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ENGINEERING_ESTIMATES_READ)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): Promise<IEstimateView> {
    return this.estimates.get({ id, actor });
  }

  @Patch(':id')
  @RequirePermissions(
    PERMISSIONS.ENGINEERING_ESTIMATES_READ,
    PERMISSIONS.ENGINEERING_ESTIMATES_MANAGE,
  )
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateEngineeringEstimateDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): Promise<IEstimateView> {
    return this.estimates.update({ id, actor }, input);
  }

  @Post(':id/plans')
  @RequirePermissions(
    PERMISSIONS.ENGINEERING_ESTIMATES_READ,
    PERMISSIONS.ENGINEERING_ESTIMATES_MANAGE,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: ESTIMATE_LIMITS.PLAN_BYTES,
        files: 1,
        fields: 2,
        fieldSize: 32,
      },
    }),
  )
  uploadPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | null,
    @Body() input: EstimateUploadPlanDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): Promise<IEstimateView> {
    if (!file) {
      throw new BadRequestException('יש לבחור תוכנית להעלאה');
    }

    return this.estimates.addPlan({
      id,
      actor,
      version: input.version,
      name: decodeUploadedFileName(file.originalname),
      marked: input.marked === 'true',
      content: file.buffer,
    });
  }

  @Post(':id/plans/link')
  @RequirePermissions(
    PERMISSIONS.ENGINEERING_ESTIMATES_READ,
    PERMISSIONS.ENGINEERING_ESTIMATES_MANAGE,
  )
  linkPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: EstimateLinkPlanDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): Promise<IEstimateView> {
    return this.estimates.linkPlan(
      { id, actor, version: input.version },
      input.fileId,
    );
  }

  @Get(':id/plans/:planId')
  @Header('X-Content-Type-Options', 'nosniff')
  @RequirePermissions(PERMISSIONS.ENGINEERING_ESTIMATES_READ)
  async downloadPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): Promise<StreamableFile> {
    const plan = await this.estimates.downloadPlan({ id, actor }, planId);
    return attachment(plan.content, plan.name, plan.mimeType);
  }

  @Post(':id/sketch')
  @HttpCode(200)
  @RequirePermissions(
    PERMISSIONS.ENGINEERING_ESTIMATES_READ,
    PERMISSIONS.ENGINEERING_ESTIMATES_MANAGE,
  )
  async sketch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: EstimateSketchDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): Promise<StreamableFile> {
    const pdf = await this.approval.sketch({ id, actor }, input);
    return attachment(pdf, 'סקיצת כתב כמויות.pdf', ESTIMATE_PLAN_MIME.PDF);
  }

  @Get(':id/sketch')
  @RequirePermissions(PERMISSIONS.ENGINEERING_ESTIMATES_READ)
  async currentSketch(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): Promise<StreamableFile> {
    const pdf = await this.approval.currentSketch({ id, actor });
    return attachment(pdf, 'סקיצת כתב כמויות.pdf', ESTIMATE_PLAN_MIME.PDF);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(
    PERMISSIONS.ENGINEERING_ESTIMATES_READ,
    PERMISSIONS.ENGINEERING_ESTIMATES_APPROVE,
  )
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: EstimateVersionDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): Promise<IEstimateView> {
    return this.approval.approve({ id, actor }, input.version);
  }

  @Post(':id/quotation')
  @RequirePermissions(
    PERMISSIONS.ENGINEERING_ESTIMATES_READ,
    PERMISSIONS.ENGINEERING_ESTIMATES_MANAGE,
  )
  quotation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: EstimateQuotationDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): Promise<{ quotationId: string }> {
    return this.approval.createQuotation({ id, actor }, input);
  }

  @Get(':id/proposal')
  @RequirePermissions(PERMISSIONS.ENGINEERING_ESTIMATES_READ)
  async proposal(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): Promise<StreamableFile> {
    const pdf = await this.approval.proposal({ id, actor });
    return attachment(pdf, 'הצעת מחיר מכתב כמויות.pdf', ESTIMATE_PLAN_MIME.PDF);
  }
}
