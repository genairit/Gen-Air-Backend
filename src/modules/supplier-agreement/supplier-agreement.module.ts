import { Module } from '@nestjs/common';
import { DatabaseModule } from '@Providers/database/database.module';
import { SupplierAgreementService } from './supplier-agreement.service';
import { ProjectBoqModule } from '@Modules/project-boq/project-boq.module';
import { SupplierAgreementController } from './supplier-agreement.controller';
import { SupplierAgreementRepository } from './supplier-agreement.repository';

@Module({
  imports: [DatabaseModule, ProjectBoqModule],
  controllers: [SupplierAgreementController],
  providers: [SupplierAgreementService, SupplierAgreementRepository],
  exports: [SupplierAgreementService],
})
export class SupplierAgreementModule {}
