import {
  Get,
  Body,
  Post,
  Param,
  Patch,
  Query,
  Controller,
  ParseUUIDPipe,
} from '@nestjs/common';

import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { PurchaseRecordService } from './purchase-record.service';
import { CreatePurchaseRecordDto } from './dto/create-purchase-record.dto';
import { PurchaseHistoryQueryDto } from './dto/purchase-history-query.dto';
import { CorrectPurchaseRecordDto } from './dto/correct-purchase-record.dto';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';
import { TransitionPurchaseRecordDto } from './dto/transition-purchase-record.dto';

@ApiTags('purchase-record')
@Controller('purchase-record')
export class PurchaseRecordController {
  constructor(private readonly service: PurchaseRecordService) {}

  @Get(':projectId/workspace')
  @RequirePermissions(PERMISSIONS.PROJECT_BOQ_READ)
  workspace(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: PurchaseHistoryQueryDto,
  ) {
    return this.service.workspace(projectId, query);
  }

  @Post(':projectId/drafts')
  @RequirePermissions(PERMISSIONS.PURCHASE_REQUESTS_REVIEW)
  draft(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() input: CreatePurchaseRecordDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ) {
    return this.service.createDraft(projectId, input, user);
  }

  @Post(':projectId/requests')
  @RequirePermissions(PERMISSIONS.PURCHASE_REQUESTS_REVIEW)
  request(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() input: CreatePurchaseRecordDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ) {
    return this.service.request(projectId, input, user);
  }

  @Post(':projectId/orders')
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDERS_APPROVE)
  order(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() input: CreatePurchaseRecordDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ) {
    return this.service.recordOrder(projectId, input, user);
  }

  @Patch(':projectId/records/:recordId/status')
  @RequirePermissions(PERMISSIONS.PURCHASE_REQUESTS_REVIEW)
  transition(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() input: TransitionPurchaseRecordDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ) {
    return this.service.transition(projectId, recordId, input, user);
  }

  @Post(':projectId/lines/:lineId/corrections')
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDERS_APPROVE)
  correct(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() input: CorrectPurchaseRecordDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ) {
    return this.service.correctOrderedLine(projectId, lineId, input, user);
  }
}
