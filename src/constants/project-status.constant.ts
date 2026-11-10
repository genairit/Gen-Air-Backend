export const PROJECT_STATUS_IDS = {
  NOT_STARTED: '6502a045-2a7d-4bc8-8ba1-36eaedc49a05',
  IN_PROGRESS: '6502a045-2a7d-4bc8-8ba1-36eaedc49a02',
  WAITING_FOR_RESPONSE: '6502a045-2a7d-4bc8-8ba1-36eaedc49a06',
  COMPLETED: '6502a045-2a7d-4bc8-8ba1-36eaedc49a07',
} as const;
export const FIXED_PROJECT_STATUSES = [
  { id: PROJECT_STATUS_IDS.NOT_STARTED, name: 'טרם בעבודה', position: 0 },
  { id: PROJECT_STATUS_IDS.IN_PROGRESS, name: 'בעבודה', position: 1 },
  {
    id: PROJECT_STATUS_IDS.WAITING_FOR_RESPONSE,
    name: 'מחכה לתשובה',
    position: 2,
  },
  { id: PROJECT_STATUS_IDS.COMPLETED, name: 'הושלם', position: 3 },
] as const;
export const PROJECT_STATUS_MIGRATION_MESSAGE =
  'The four fixed project statuses are not configured. Apply the engineering-four-project-statuses migration.';
export const ARCHIVED_PROJECT_STATUS_IDS = {
  ON_HOLD: '6502a045-2a7d-4bc8-8ba1-36eaedc49a03',
} as const;
// Migration-remapped On Hold projects carry their waiting reason on the archived status transition.
export const WAITING_REASON_SOURCE_STATUS_IDS: readonly string[] = [
  PROJECT_STATUS_IDS.WAITING_FOR_RESPONSE,
  ARCHIVED_PROJECT_STATUS_IDS.ON_HOLD,
];
export const REASON_REQUIRED_PROJECT_STATUS_IDS: readonly string[] = [
  PROJECT_STATUS_IDS.WAITING_FOR_RESPONSE,
];
