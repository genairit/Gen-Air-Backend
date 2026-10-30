import { FIELD_LENGTHS } from '@Constants/field-length.constant';

export const TASK_TYPES = {
  QUOTATION: 'quotation',
  PLANNING: 'planning',
  GENERAL: 'general',
} as const;

export type TaskType = (typeof TASK_TYPES)[keyof typeof TASK_TYPES];

export const TASK_TYPE_VALUES = Object.values(TASK_TYPES);
export const MANUAL_TASK_TYPES = [TASK_TYPES.GENERAL] as const;
export const PROTECTED_TASK_TYPES = [
  TASK_TYPES.QUOTATION,
  TASK_TYPES.PLANNING,
] as const;
export type ProtectedTaskType = (typeof PROTECTED_TASK_TYPES)[number];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  quotation: 'הצעת מחיר',
  planning: 'תכנון',
  general: 'כללי',
};

export const PROJECT_TASK_TITLE_SEPARATOR = ' — ';
export const TASK_STORED_TITLE_LENGTH = Math.max(
  FIELD_LENGTHS.TASK_TITLE,
  FIELD_LENGTHS.PROJECT_NAME +
    PROJECT_TASK_TITLE_SEPARATOR.length +
    Math.max(
      ...PROTECTED_TASK_TYPES.map((type) => TASK_TYPE_LABELS[type].length),
    ),
);
