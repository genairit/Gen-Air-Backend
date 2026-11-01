import { Module } from '@nestjs/common';
import { QuotationRuleService } from './quotation-rule.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { QuotationRuleRepository } from './quotation-rule.repository';
import { QuotationRuleController } from './quotation-rule.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [QuotationRuleController],
  providers: [QuotationRuleService, QuotationRuleRepository],
  exports: [QuotationRuleService],
})
export class QuotationRuleModule {}
