import { Module } from '@nestjs/common';
import { TaskModule } from '@Modules/task/task.module';
import { TaskDataModule } from '@Modules/task/task-data.module';
import { ProjectModule } from '@Modules/project/project.module';
import { DatabaseModule } from '@Providers/database/database.module';
import { QuotationEmailTransport } from './quotation-email-transport.service';
import { ProjectDriveModule } from '@Modules/project-drive/project-drive.module';
import { QuotationExecutionEmailService } from './quotation-execution-email.service';
import { CustomerContactModule } from '@Modules/customer-contact/customer-contact.module';
import { QuotationExecutionEmailController } from './quotation-execution-email.controller';
import { QuotationExecutionEmailRepository } from './quotation-execution-email.repository';

@Module({
  imports: [
    TaskModule,
    TaskDataModule,
    ProjectModule,
    CustomerContactModule,
    ProjectDriveModule,
    DatabaseModule,
  ],
  controllers: [QuotationExecutionEmailController],
  providers: [
    QuotationExecutionEmailService,
    QuotationExecutionEmailRepository,
    QuotationEmailTransport,
  ],
})
export class QuotationExecutionEmailModule {}
