export const TASK_STATUSES = {
  WAITING_FOR_RESPONSE: 'waiting_for_response',
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  IN_REVIEW: 'in_review',
  PROPOSAL_SENT: 'proposal_sent',
} as const;
export type TaskStatusType = (typeof TASK_STATUSES)[keyof typeof TASK_STATUSES];
export const TASK_STATUS_VALUES = Object.values(TASK_STATUSES);
