import { Module } from '@nestjs/common';
import { PurchaseRecordService } from './purchase-record.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { PurchaseRecordController } from './purchase-record.controller';
import { PurchaseRecordRepository } from './purchase-record.repository';
import { ProjectBoqModule } from '@Modules/project-boq/project-boq.module';

@Module({
  imports: [DatabaseModule, ProjectBoqModule],
  controllers: [PurchaseRecordController],
  providers: [PurchaseRecordService, PurchaseRecordRepository],
  exports: [PurchaseRecordService],
})
export class PurchaseRecordModule {}
