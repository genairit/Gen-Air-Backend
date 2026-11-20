import {
  Get,
  Body,
  Post,
  Param,
  Patch,
  Controller,
  ParseUUIDPipe,
} from '@nestjs/common';

import {
  CreateExecutionPlanDto,
  DecideExecutionPlanDto,
  ExecutionPlanRevisionDto,
  UpdateExecutionPlanChecklistDto,
} from './dto/execution-plan.dto';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ExecutionPlanService } from './execution-plan.service';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@ApiTags('execution-plan')
@ApiBearerAuth()
@Controller('execution-plan')
export class ExecutionPlanController {
  constructor(private readonly service: ExecutionPlanService) {}

  @Get('template')
  @RequirePermissions(PERMISSIONS.EXECUTION_PLANS_SUBMIT)
  template(): ReturnType<ExecutionPlanService['latestTemplate']> {
    return this.service.latestTemplate();
  }

  @Get('pending')
  @RequirePermissions(PERMISSIONS.EXECUTION_PLANS_APPROVE)
  pending(
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): ReturnType<ExecutionPlanService['pending']> {
    return this.service.pending(actor);
  }

  @Get('quotation/:quotationId')
  @RequirePermissions(
    PERMISSIONS.EXECUTION_PLANS_READ,
    PERMISSIONS.QUOTATIONS_READ,
    PERMISSIONS.PROJECTS_READ,
  )
  forQuotation(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): ReturnType<ExecutionPlanService['forQuotation']> {
    return this.service.forQuotation(quotationId, actor);
  }

  @Get('project/:projectId/file/:fileId/draft')
  @RequirePermissions(
    PERMISSIONS.EXECUTION_PLANS_SUBMIT,
    PERMISSIONS.PROJECTS_READ,
  )
  ownDraftForFile(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('fileId') fileId: string,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): ReturnType<ExecutionPlanService['ownDraftForFile']> {
    return this.service.ownDraftForFile(projectId, fileId, actor);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EXECUTION_PLANS_READ)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): ReturnType<ExecutionPlanService['getById']> {
    return this.service.getById(id, actor);
  }

  @Post()
  @RequirePermissions(
    PERMISSIONS.EXECUTION_PLANS_SUBMIT,
    PERMISSIONS.QUOTATIONS_READ,
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.DRIVE_READ,
  )
  create(
    @Body() input: CreateExecutionPlanDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): ReturnType<ExecutionPlanService['create']> {
    return this.service.create(input, actor);
  }

  @Patch(':id/checklist')
  @RequirePermissions(PERMISSIONS.EXECUTION_PLANS_SUBMIT)
  updateChecklist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateExecutionPlanChecklistDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): ReturnType<ExecutionPlanService['updateChecklist']> {
    return this.service.updateChecklist(
      id,
      input.revision,
      input.confirmedKeys,
      actor,
    );
  }

  @Post(':id/submit')
  @RequirePermissions(
    PERMISSIONS.EXECUTION_PLANS_SUBMIT,
    PERMISSIONS.DRIVE_READ,
  )
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ExecutionPlanRevisionDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): ReturnType<ExecutionPlanService['submit']> {
    return this.service.submit(id, input.revision, actor);
  }

  @Post(':id/decision')
  @RequirePermissions(
    PERMISSIONS.EXECUTION_PLANS_APPROVE,
    PERMISSIONS.DRIVE_READ,
  )
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: DecideExecutionPlanDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): ReturnType<ExecutionPlanService['decide']> {
    return this.service.decide(id, input, actor);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.EXECUTION_PLANS_SUBMIT)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ExecutionPlanRevisionDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): ReturnType<ExecutionPlanService['cancel']> {
    return this.service.cancel(id, input.revision, actor);
  }
}
