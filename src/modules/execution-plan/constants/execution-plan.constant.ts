export const EXECUTION_PLAN_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  RETURNED: 'returned',
  CANCELLED: 'cancelled',
} as const;

export type ExecutionPlanStatusType =
  (typeof EXECUTION_PLAN_STATUS)[keyof typeof EXECUTION_PLAN_STATUS];

export const EXECUTION_PLAN_DECISION = {
  APPROVE: 'approve',
  RETURN: 'return',
} as const;

export type ExecutionPlanDecisionType =
  (typeof EXECUTION_PLAN_DECISION)[keyof typeof EXECUTION_PLAN_DECISION];
