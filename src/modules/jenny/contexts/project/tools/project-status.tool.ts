import {
  IJennyTool,
  IJennyToolResult,
  IJennyProjectScope,
} from '../../../interfaces/jenny.interface';

import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ProjectService } from '@Modules/project/project.service';
import { toProjectStatus } from '../project-jenny-context.utility';
import { PROJECT_JENNY_TOOL_DEFINITIONS } from '../project-jenny-tools.constant';

@Injectable()
export class ProjectStatusJennyTool implements IJennyTool<IJennyProjectScope> {
  readonly requiredPermissions = [PERMISSIONS.PROJECTS_READ];
  readonly definition = PROJECT_JENNY_TOOL_DEFINITIONS.GET_PROJECT_STATUS;

  constructor(private readonly projectService: ProjectService) {}

  async execute(scope: IJennyProjectScope): Promise<IJennyToolResult> {
    const project = await this.projectService.getById(scope.projectId);

    return { data: toProjectStatus(project), sources: [] };
  }
}
