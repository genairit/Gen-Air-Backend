import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProjectModule } from '@Modules/project/project.module';
import { EstimateExportService } from './estimate-export.service';
import { CustomerModule } from '@Modules/customer/customer.module';
import { EstimatePricingService } from './estimate-pricing.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { QuotationModule } from '@Modules/quotation/quotation.module';
import { EstimateApprovalService } from './estimate-approval.service';
import { EstimateDocumentService } from './estimate-document.service';
import { EngineeringEstimateService } from './engineering-estimate.service';
import { ProjectDriveModule } from '@Modules/project-drive/project-drive.module';
import { EngineeringEstimateRepository } from './engineering-estimate.repository';
import { EngineeringEstimateController } from './engineering-estimate.controller';
import { CatalogueItemModule } from '@Modules/catalogue-item/catalogue-item.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ProjectModule,
    ProjectDriveModule,
    CatalogueItemModule,
    CustomerModule,
    QuotationModule,
  ],
  controllers: [EngineeringEstimateController],
  providers: [
    EngineeringEstimateRepository,
    EngineeringEstimateService,
    EstimatePricingService,
    EstimateApprovalService,
    EstimateDocumentService,
    EstimateExportService,
  ],
})
export class EngineeringEstimateModule {}
