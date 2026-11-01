import { Module } from '@nestjs/common';
import { DatabaseModule } from '@Providers/database/database.module';
import { QuotationSectionService } from './quotation-section.service';
import { QuotationSectionRepository } from './quotation-section.repository';
import { QuotationSectionController } from './quotation-section.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [QuotationSectionController],
  providers: [QuotationSectionService, QuotationSectionRepository],
  exports: [QuotationSectionService],
})
export class QuotationSectionModule {}
