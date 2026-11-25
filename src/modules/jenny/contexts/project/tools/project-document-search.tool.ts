import {
  SEARCH_QUERY_ARGUMENT,
  PROJECT_JENNY_TOOL_DEFINITIONS,
} from '../project-jenny-tools.constant';

import {
  toHitSource,
  toDocumentHit,
  toSkippedDocument,
} from '../project-jenny-context.utility';

import {
  IJennyTool,
  IJennyToolResult,
  IJennyProjectScope,
  TJennyToolArguments,
} from '../../../interfaces/jenny.interface';

import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { requireStringArgument } from '../../../utilities/jenny-tool-arguments.utility';
import { ProjectDocumentService } from '@Modules/project-document/project-document.service';

@Injectable()
export class ProjectDocumentSearchJennyTool implements IJennyTool<IJennyProjectScope> {
  readonly definition = PROJECT_JENNY_TOOL_DEFINITIONS.SEARCH_PROJECT_DOCUMENTS;
  readonly requiredPermissions = [
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.DRIVE_READ,
  ];

  constructor(
    private readonly projectDocumentService: ProjectDocumentService,
  ) {}

  async execute(
    scope: IJennyProjectScope,
    args: TJennyToolArguments,
  ): Promise<IJennyToolResult> {
    const query = requireStringArgument(args, SEARCH_QUERY_ARGUMENT);
    const search = await this.projectDocumentService.search({
      query,
      projectId: scope.projectId,
    });

    return {
      sources: search.hits.map(toHitSource),
      data: {
        pendingFiles: search.pendingFiles,
        hits: search.hits.map(toDocumentHit),
        skippedFiles: search.skipped.map(toSkippedDocument),
      },
    };
  }
}
