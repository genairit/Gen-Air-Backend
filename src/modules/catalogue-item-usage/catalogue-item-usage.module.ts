import { Module } from '@nestjs/common';
import { DatabaseModule } from '@Providers/database/database.module';
import { CatalogueItemUsageService } from './catalogue-item-usage.service';
import { CatalogueItemUsageRepository } from './catalogue-item-usage.repository';
import { CatalogueItemUsageController } from './catalogue-item-usage.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [CatalogueItemUsageController],
  providers: [CatalogueItemUsageService, CatalogueItemUsageRepository],
  exports: [CatalogueItemUsageService],
})
export class CatalogueItemUsageModule {}
