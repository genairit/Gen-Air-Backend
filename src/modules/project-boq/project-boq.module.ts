import { Module } from '@nestjs/common';
import { ProjectBoqService } from './project-boq.service';
import { ProjectBoqController } from './project-boq.controller';
import { ProjectBoqRepository } from './project-boq.repository';
import { ProjectModule } from '@Modules/project/project.module';
import { MaterialModule } from '@Modules/material/material.module';
import { DatabaseModule } from '@Providers/database/database.module';
import { QuotationModule } from '@Modules/quotation/quotation.module';

@Module({
  imports: [DatabaseModule, ProjectModule, QuotationModule, MaterialModule],
  controllers: [ProjectBoqController],
  providers: [ProjectBoqService, ProjectBoqRepository],
})
export class ProjectBoqModule {}
