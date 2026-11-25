import { Module } from '@nestjs/common';
import { JennyService } from './jenny.service';
import { JennyController } from './jenny.controller';
import { LLM_PROVIDER } from '@Constants/llm.constant';
import { JennyContextRegistry } from './jenny-context.registry';
import { ProjectModule } from '@Modules/project/project.module';
import { QuotationModule } from '@Modules/quotation/quotation.module';
import { createJennyLlmProvider } from './utilities/jenny-settings.utility';
import { QuotationJennyTool } from './contexts/project/tools/quotation.tool';
import { ProjectDriveModule } from '@Modules/project-drive/project-drive.module';
import { ProjectStatusJennyTool } from './contexts/project/tools/project-status.tool';
import { ProjectDocumentModule } from '@Modules/project-document/project-document.module';
import { ProjectDocumentsJennyTool } from './contexts/project/tools/project-documents.tool';
import { ProjectJennyContextService } from './contexts/project/project-jenny-context.service';
import { ProjectDocumentSearchJennyTool } from './contexts/project/tools/project-document-search.tool';

@Module({
  imports: [
    ProjectModule,
    QuotationModule,
    ProjectDriveModule,
    ProjectDocumentModule,
  ],
  controllers: [JennyController],
  providers: [
    JennyService,
    JennyContextRegistry,
    ProjectJennyContextService,
    ProjectStatusJennyTool,
    QuotationJennyTool,
    ProjectDocumentsJennyTool,
    ProjectDocumentSearchJennyTool,
    { provide: LLM_PROVIDER, useFactory: createJennyLlmProvider },
  ],
})
export class JennyModule {}
