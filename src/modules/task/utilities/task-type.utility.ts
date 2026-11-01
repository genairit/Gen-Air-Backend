import {
  TaskType,
  ProtectedTaskType,
  PROTECTED_TASK_TYPES,
} from '../constants/task-type.constant';

export const isProtectedTaskType = (
  type: TaskType | null,
): type is ProtectedTaskType =>
  PROTECTED_TASK_TYPES.some((protectedType) => protectedType === type);
