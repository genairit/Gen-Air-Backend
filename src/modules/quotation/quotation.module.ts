import { Module } from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { QuotationRepository } from './quotation.repository';
import { QuotationController } from './quotation.controller';
import { ProjectModule } from '@Modules/project/project.module';
import { CustomerModule } from '@Modules/customer/customer.module';
import { DatabaseModule } from '@Providers/database/database.module';
import { QuotationSelectionService } from './quotation-selection.service';
import { QuotationRuleModule } from '@Modules/quotation-rule/quotation-rule.module';
import { CatalogueItemModule } from '@Modules/catalogue-item/catalogue-item.module';
import { QuotationItemModule } from '@Modules/quotation-item/quotation-item.module';
import { QuotationSectionModule } from '@Modules/quotation-section/quotation-section.module';
import { CatalogueItemUsageModule } from '@Modules/catalogue-item-usage/catalogue-item-usage.module';

@Module({
  imports: [
    DatabaseModule,
    QuotationRuleModule,
    CustomerModule,
    ProjectModule,
    CatalogueItemModule,
    CatalogueItemUsageModule,
    QuotationItemModule,
    QuotationSectionModule,
  ],
  controllers: [QuotationController],
  providers: [QuotationService, QuotationRepository, QuotationSelectionService],
  exports: [QuotationService],
})
export class QuotationModule {}
