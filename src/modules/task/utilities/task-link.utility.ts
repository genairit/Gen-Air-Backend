import { ITask, TTaskLink, TTaskLinkInput } from '../interfaces/task.interface';

export const isTaskLinkRequested = (input: TTaskLinkInput): boolean =>
  'projectId' in input || 'customerId' in input;

export const toTaskLink = (input: TTaskLinkInput): TTaskLink | null => {
  const projectId = input.projectId ?? null;
  const customerId = input.customerId ?? null;
  const hasProject = projectId !== null;
  const hasCustomer = customerId !== null;

  const hasExactlyOneLink = hasProject !== hasCustomer;

  if (!hasExactlyOneLink) {
    return null;
  }

  return { projectId, customerId };
};

export const resolveTaskCustomerId = (
  task: Pick<ITask, 'customerId' | 'project'>,
): string | null =>
  task.customerId ??
  task.project?.customer?.id ??
  task.project?.parentProject?.customer?.id ??
  null;
