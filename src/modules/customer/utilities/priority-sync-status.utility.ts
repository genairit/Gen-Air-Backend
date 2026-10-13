import {
  PrioritySyncStatusType,
  PRIORITY_SYNC_STATUS_VALUES,
} from '../constants/priority-sync-status.constant';

export const isPrioritySyncStatus = (
  value: unknown,
): value is PrioritySyncStatusType =>
  PRIORITY_SYNC_STATUS_VALUES.some((status) => status === value);
