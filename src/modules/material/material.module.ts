import { Module } from '@nestjs/common';
import { MaterialService } from './material.service';
import { MaterialController } from './material.controller';
import { MaterialRepository } from './material.repository';
import { DatabaseModule } from '@Providers/database/database.module';
import { CatalogueMaterialService } from './catalogue-material.service';
import { CatalogueMaterialRepository } from './catalogue-material.repository';
import { CatalogueMaterialController } from './catalogue-material.controller';
import { CatalogueItemModule } from '@Modules/catalogue-item/catalogue-item.module';

@Module({
  imports: [DatabaseModule, CatalogueItemModule],
  controllers: [MaterialController, CatalogueMaterialController],
  providers: [
    MaterialService,
    MaterialRepository,
    CatalogueMaterialService,
    CatalogueMaterialRepository,
  ],
  exports: [MaterialService, CatalogueMaterialService],
})
export class MaterialModule {}
