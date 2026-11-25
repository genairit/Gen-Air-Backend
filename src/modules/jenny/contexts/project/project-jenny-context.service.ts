import {
  IJennyTool,
  IJennyProjectScope,
  IJennyContextRequest,
  IJennyResolvedContext,
  IJennyContextProvider,
} from '../../interfaces/jenny.interface';

import { Injectable } from '@nestjs/common';
import { QuotationJennyTool } from './tools/quotation.tool';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ProjectService } from '@Modules/project/project.service';
import { assertPermissions } from '@Utilities/permission.utility';
import { ProjectTasksJennyTool } from './tools/project-tasks.tool';
import { ProjectStatusJennyTool } from './tools/project-status.tool';
import { bindPermittedTools } from '../../utilities/jenny-tool.utility';
import { ProjectDocumentsJennyTool } from './tools/project-documents.tool';
import { buildProjectContextPrompt } from './project-jenny-context.utility';
import { ProjectDocumentSearchJennyTool } from './tools/project-document-search.tool';
import { ProjectDocumentService } from '@Modules/project-document/project-document.service';

@Injectable()
export class ProjectJennyContextService implements IJennyContextProvider {
  private readonly tools: readonly IJennyTool<IJennyProjectScope>[];

  constructor(
    private readonly projectService: ProjectService,
    private readonly projectDocumentService: ProjectDocumentService,
    projectStatusTool: ProjectStatusJennyTool,
    quotationTool: QuotationJennyTool,
    projectDocumentsTool: ProjectDocumentsJennyTool,
    projectDocumentSearchTool: ProjectDocumentSearchJennyTool,
    projectTasksTool: ProjectTasksJennyTool,
  ) {
    this.tools = [
      projectStatusTool,
      quotationTool,
      projectDocumentsTool,
      projectDocumentSearchTool,
      projectTasksTool,
    ];
  }

  async resolve(request: IJennyContextRequest): Promise<IJennyResolvedContext> {
    assertPermissions(request.user, PERMISSIONS.PROJECTS_READ);

    const project = await this.projectService.getById(request.id);

    return {
      prompt: buildProjectContextPrompt(project),
      tools: bindPermittedTools({
        tools: this.tools,
        user: request.user,
        scope: {
          projectId: project.id,
          documents: this.projectDocumentService.openSession({
            projectId: project.id,
            signal: request.signal,
          }),
        },
      }),
    };
  }
}
