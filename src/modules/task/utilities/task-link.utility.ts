import { ITask, TTaskLinkInput } from '../interfaces/task.interface';

export const isTaskLinkRequested = (input: TTaskLinkInput): boolean =>
  'projectId' in input || 'customerId' in input;

export const resolveTaskCustomerId = (
  task: Pick<ITask, 'customerId' | 'project'>,
): string | null =>
  task.project?.customer?.id ??
  task.project?.parentProject?.customer?.id ??
  task.customerId ??
  null;
