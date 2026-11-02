import {
  Get,
  Body,
  Post,
  Param,
  Controller,
  ParseUUIDPipe,
} from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';
import { QuotationExecutionEmailService } from './quotation-execution-email.service';
import { SendQuotationExecutionEmailDto } from './dto/send-quotation-execution-email.dto';
import { PreviewQuotationExecutionEmailDto } from './dto/preview-quotation-execution-email.dto';

@ApiTags('quotation-execution-email')
@ApiBearerAuth()
@Controller('quotation-execution-email')
export class QuotationExecutionEmailController {
  constructor(private readonly service: QuotationExecutionEmailService) {}

  @Get(':taskId/context')
  @RequirePermissions(
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.DRIVE_READ,
  )
  getContext(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.service.getContext(taskId);
  }

  @Post(':taskId/preview')
  @RequirePermissions(
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.CUSTOMERS_READ,
  )
  getPreview(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() input: PreviewQuotationExecutionEmailDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ) {
    return this.service.getPreview(
      taskId,
      input.architectContactId,
      input.planVersion,
      user,
    );
  }

  @Get(':taskId/status')
  @RequirePermissions(PERMISSIONS.TASKS_READ)
  getStatus(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.service.getStatus(taskId);
  }

  @Post(':taskId/send')
  @RequirePermissions(
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.TASKS_STATUS_UPDATE,
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.DRIVE_READ,
  )
  send(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() input: SendQuotationExecutionEmailDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ) {
    return this.service.send(taskId, input, user);
  }
}
