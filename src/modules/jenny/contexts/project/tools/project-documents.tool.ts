import {
  toFileSource,
  toListedDocument,
  sortByRecentlyModified,
} from '../project-jenny-context.utility';

import {
  IJennyTool,
  IJennyToolResult,
  IJennyProjectScope,
} from '../../../interfaces/jenny.interface';

import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { JENNY_LIMITS } from '../../../constants/jenny.constant';
import { PROJECT_JENNY_TOOL_DEFINITIONS } from '../project-jenny-tools.constant';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';

@Injectable()
export class ProjectDocumentsJennyTool implements IJennyTool<IJennyProjectScope> {
  readonly definition = PROJECT_JENNY_TOOL_DEFINITIONS.LIST_PROJECT_DOCUMENTS;
  readonly requiredPermissions = [
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.DRIVE_READ,
  ];

  constructor(private readonly projectDriveService: ProjectDriveService) {}

  async execute(scope: IJennyProjectScope): Promise<IJennyToolResult> {
    const files = await this.projectDriveService.listProjectFiles(
      scope.projectId,
    );
    const listedFiles = sortByRecentlyModified(files).slice(
      0,
      JENNY_LIMITS.MAX_LISTED_DOCUMENTS,
    );

    return {
      sources: listedFiles.map(toFileSource),
      data: {
        totalFiles: files.length,
        files: listedFiles.map(toListedDocument),
        truncated: files.length > listedFiles.length,
      },
    };
  }
}
