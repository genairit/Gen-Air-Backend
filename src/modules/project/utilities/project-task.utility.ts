import {
  TASK_TYPE_LABELS,
  ProtectedTaskType,
  PROJECT_TASK_TITLE_SEPARATOR,
} from '@Modules/task/constants/task-type.constant';

import { IProject } from '../interfaces/project.interface';
import { PROJECT_TASK_DESCRIPTIONS } from '../constants/project-task.constant';
import { TTaskCreationAttributes } from '@Modules/task/interfaces/task.interface';

export const toProjectTaskAttributes = (
  project: Pick<IProject, 'id' | 'name'>,
  createdById: string,
  taskType: ProtectedTaskType,
): TTaskCreationAttributes => {
  const description = PROJECT_TASK_DESCRIPTIONS[taskType];
  return {
    taskType,
    createdById,
    dueDate: null,
    customerId: null,
    assigneeId: null,
    projectId: project.id,
    title: `${TASK_TYPE_LABELS[taskType]}${PROJECT_TASK_TITLE_SEPARATOR}${project.name}`,
    description: `${description.prefix}${project.name}${description.suffix}`,
  };
};
