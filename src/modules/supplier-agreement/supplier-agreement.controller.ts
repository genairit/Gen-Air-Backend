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

import {
  UpdateSupplierDto,
  CreateAgreementDto,
  SupplierDetailsDto,
  UpdateAgreementDto,
} from './dto/supplier-agreement.dto';

import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { SupplierAgreementService } from './supplier-agreement.service';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@ApiTags('supplier-agreement')
@Controller('supplier-agreement')
export class SupplierAgreementController {
  constructor(private readonly service: SupplierAgreementService) {}

  @Get('suppliers')
  @RequirePermissions(PERMISSIONS.SUPPLIER_AGREEMENTS_MANAGE)
  suppliers(@Query('search') search = '') {
    return this.service.searchSuppliers(search);
  }

  @Post('suppliers')
  @RequirePermissions(PERMISSIONS.SUPPLIER_AGREEMENTS_MANAGE)
  createSupplier(
    @Body() input: SupplierDetailsDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ) {
    return this.service.createSupplier(input, user.id);
  }

  @Patch('suppliers/:supplierId')
  @RequirePermissions(PERMISSIONS.SUPPLIER_AGREEMENTS_MANAGE)
  updateSupplier(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() input: UpdateSupplierDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ) {
    return this.service.updateSupplier(supplierId, input, user.id);
  }

  @Get('projects/:projectId/agreements')
  @RequirePermissions(PERMISSIONS.SUPPLIER_AGREEMENTS_MANAGE)
  agreements(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.projectAgreements(projectId);
  }

  @Post('projects/:projectId/agreements')
  @RequirePermissions(PERMISSIONS.SUPPLIER_AGREEMENTS_MANAGE)
  createAgreement(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() input: CreateAgreementDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ) {
    return this.service.createAgreement(projectId, input, user.id);
  }

  @Patch('projects/:projectId/agreements/:agreementId')
  @RequirePermissions(PERMISSIONS.SUPPLIER_AGREEMENTS_MANAGE)
  updateAgreement(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('agreementId', ParseUUIDPipe) agreementId: string,
    @Body() input: UpdateAgreementDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ) {
    return this.service.updateAgreement(projectId, agreementId, input, user.id);
  }

  @Get('projects/:projectId/agreements/:agreementId/history')
  @RequirePermissions(PERMISSIONS.SUPPLIER_AGREEMENTS_MANAGE)
  history(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('agreementId', ParseUUIDPipe) agreementId: string,
  ) {
    return this.service.history(projectId, agreementId);
  }
}
