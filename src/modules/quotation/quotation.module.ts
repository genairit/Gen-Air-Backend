import { Module } from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { UserModule } from '@Modules/user/user.module';
import { QuotationRepository } from './quotation.repository';
import { QuotationController } from './quotation.controller';
import { QuotationPdfService } from './quotation-pdf.service';
import { ProjectModule } from '@Modules/project/project.module';
import { CustomerModule } from '@Modules/customer/customer.module';
import { DatabaseModule } from '@Providers/database/database.module';
import { UserRoleModule } from '@Modules/user-role/user-role.module';
import { QuotationSelectionService } from './quotation-selection.service';
import { ProjectDriveModule } from '@Modules/project-drive/project-drive.module';
import { QuotationRuleModule } from '@Modules/quotation-rule/quotation-rule.module';
import { CatalogueItemModule } from '@Modules/catalogue-item/catalogue-item.module';
import { QuotationItemModule } from '@Modules/quotation-item/quotation-item.module';
import { QuotationProjectModule } from '@Modules/quotation-project/quotation-project.module';
import { QuotationSectionModule } from '@Modules/quotation-section/quotation-section.module';
import { CatalogueItemUsageModule } from '@Modules/catalogue-item-usage/catalogue-item-usage.module';

@Module({
  imports: [
    DatabaseModule,
    QuotationRuleModule,
    CustomerModule,
    ProjectModule,
    ProjectDriveModule,
    CatalogueItemModule,
    CatalogueItemUsageModule,
    QuotationItemModule,
    QuotationSectionModule,
    QuotationProjectModule,
    UserModule,
    UserRoleModule,
  ],
  controllers: [QuotationController],
  providers: [
    QuotationService,
    QuotationRepository,
    QuotationSelectionService,
    QuotationPdfService,
  ],
  exports: [QuotationService],
})
export class QuotationModule {}
