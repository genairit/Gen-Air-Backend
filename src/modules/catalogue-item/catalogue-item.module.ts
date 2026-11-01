import { Module } from '@nestjs/common';
import { CatalogueItemService } from './catalogue-item.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { CatalogueItemRepository } from './catalogue-item.repository';
import { CatalogueItemController } from './catalogue-item.controller';
import { CatalogueItemUsageModule } from '@Modules/catalogue-item-usage/catalogue-item-usage.module';

@Module({
  imports: [DatabaseModule, CatalogueItemUsageModule],
  controllers: [CatalogueItemController],
  providers: [CatalogueItemService, CatalogueItemRepository],
  exports: [CatalogueItemService],
})
export class CatalogueItemModule {}
