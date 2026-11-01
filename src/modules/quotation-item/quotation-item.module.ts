import { Module } from '@nestjs/common';
import { QuotationItemService } from './quotation-item.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { QuotationItemRepository } from './quotation-item.repository';
import { QuotationItemController } from './quotation-item.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [QuotationItemController],
  providers: [QuotationItemService, QuotationItemRepository],
  exports: [QuotationItemService],
})
export class QuotationItemModule {}
