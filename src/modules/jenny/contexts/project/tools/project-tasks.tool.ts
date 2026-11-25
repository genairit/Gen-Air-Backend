import {
  TASK_SEARCH_ARGUMENT,
  PROJECT_JENNY_TOOL_DEFINITIONS,
} from '../project-jenny-tools.constant';

import {
  IJennyTool,
  IJennyToolResult,
  IJennyProjectScope,
  TJennyToolArguments,
} from '../../../interfaces/jenny.interface';

import { Injectable } from '@nestjs/common';
import { TaskService } from '@Modules/task/task.service';
import { currentDateOnly } from '@Utilities/date.utility';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { JENNY_LIMITS } from '../../../constants/jenny.constant';
import { toTaskSummary } from '../project-jenny-context.utility';
import { TASK_SORTS } from '@Modules/task/constants/task-sort.constant';
import { requireStringArgument } from '../../../utilities/jenny-tool-arguments.utility';

@Injectable()
export class ProjectTasksJennyTool implements IJennyTool<IJennyProjectScope> {
  readonly definition = PROJECT_JENNY_TOOL_DEFINITIONS.GET_PROJECT_TASKS;
  readonly requiredPermissions = [
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.TASKS_READ,
  ];

  constructor(private readonly taskService: TaskService) {}

  async execute(
    { projectId }: IJennyProjectScope,
    args: TJennyToolArguments,
  ): Promise<IJennyToolResult> {
    const search =
      TASK_SEARCH_ARGUMENT.name in args
        ? { search: requireStringArgument(args, TASK_SEARCH_ARGUMENT) }
        : {};
    const [page, counts, overdueTasks] = await Promise.all([
      this.taskService.getByFilter({
        ...search,
        projectId,
        sort: TASK_SORTS.DUE_DATE_ASC,
        batchSize: JENNY_LIMITS.MAX_LISTED_TASKS,
      }),
      this.taskService.getCounts({ projectId }),
      this.taskService.getOverdueCountForProject(projectId),
    ]);

    return {
      sources: [],
      data: {
        overdueTasks,
        asOfDate: currentDateOnly(),
        totalTasks: counts.total,
        urgentTasks: counts.urgent,
        countsByStatus: counts.byStatus,
        tasks: page.items.map(toTaskSummary),
        hasMoreMatchingTasks: page.nextCursor !== null,
      },
    };
  }
}
