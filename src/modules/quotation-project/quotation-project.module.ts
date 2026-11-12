import { Module } from '@nestjs/common';
import { DatabaseModule } from '@Providers/database/database.module';
import { QuotationProjectService } from './quotation-project.service';
import { QuotationProjectRepository } from './quotation-project.repository';
import { QuotationProjectController } from './quotation-project.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [QuotationProjectController],
  providers: [QuotationProjectService, QuotationProjectRepository],
  exports: [QuotationProjectService],
})
export class QuotationProjectModule {}
