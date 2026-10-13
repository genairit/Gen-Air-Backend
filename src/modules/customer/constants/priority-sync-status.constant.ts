import { TCustomerSyncStatusCounts } from '../interfaces/customer.interface';

export const PRIORITY_SYNC_STATUSES = {
  FAILED: 'failed',
  SYNCED: 'synced',
  PENDING: 'pending',
} as const;

export type PrioritySyncStatusType =
  (typeof PRIORITY_SYNC_STATUSES)[keyof typeof PRIORITY_SYNC_STATUSES];

export const PRIORITY_SYNC_STATUS_VALUES: PrioritySyncStatusType[] =
  Object.values(PRIORITY_SYNC_STATUSES);

export const EMPTY_CUSTOMER_SYNC_STATUS_COUNTS: TCustomerSyncStatusCounts = {
  [PRIORITY_SYNC_STATUSES.FAILED]: 0,
  [PRIORITY_SYNC_STATUSES.SYNCED]: 0,
  [PRIORITY_SYNC_STATUSES.PENDING]: 0,
};
