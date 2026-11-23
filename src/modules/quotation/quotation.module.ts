import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { TaskQuotationLinksService } from './task-quotation-links.service';
import { QuotationPdfSnapshotService } from './quotation-pdf-snapshot.service';
import { GoogleDriveModule } from '@Providers/google-drive/google-drive.module';
import { ProjectDriveModule } from '@Modules/project-drive/project-drive.module';
import { QuotationRuleModule } from '@Modules/quotation-rule/quotation-rule.module';
import { CatalogueItemModule } from '@Modules/catalogue-item/catalogue-item.module';
import { QuotationItemModule } from '@Modules/quotation-item/quotation-item.module';
import { PublicationService } from '@Modules/quotation-publication/publication.service';
import { QuotationProjectModule } from '@Modules/quotation-project/quotation-project.module';
import { QuotationSectionModule } from '@Modules/quotation-section/quotation-section.module';
import { PublicationBrokerService } from '@Modules/quotation-publication/publication-broker.service';
import { CatalogueItemUsageModule } from '@Modules/catalogue-item-usage/catalogue-item-usage.module';
import { PublicationExecutorService } from '@Modules/quotation-publication/publication-executor.service';
import { PublicationDestinationModule } from '@Modules/quotation-publication/publication-destination.module';

@Module({
  imports: [
    ConfigModule,
    PublicationDestinationModule,
    GoogleDriveModule,
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
    TaskQuotationLinksService,
    QuotationRepository,
    QuotationSelectionService,
    QuotationPdfService,
    QuotationPdfSnapshotService,
    PublicationService,
    PublicationBrokerService,
    PublicationExecutorService,
  ],
  exports: [QuotationService],
})
export class QuotationModule {}
