export const TASK_STATUSES = {
  WAITING_FOR_RESPONSE: 'waiting_for_response',
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  IN_REVIEW: 'in_review',
  PROPOSAL_SENT: 'proposal_sent',
} as const;
export type TaskStatusType = (typeof TASK_STATUSES)[keyof typeof TASK_STATUSES];
export const TASK_STATUS_VALUES = Object.values(TASK_STATUSES);

export const EMPTY_TASK_STATUS_COUNTS: Record<TaskStatusType, number> = {
  [TASK_STATUSES.WAITING_FOR_RESPONSE]: 0,
  [TASK_STATUSES.NOT_STARTED]: 0,
  [TASK_STATUSES.IN_PROGRESS]: 0,
  [TASK_STATUSES.IN_REVIEW]: 0,
  [TASK_STATUSES.PROPOSAL_SENT]: 0,
};
