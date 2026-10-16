export const PROJECT_STATUS_IDS = {
  WAITING: '6502a045-2a7d-4bc8-8ba1-36eaedc49a01',
  IN_PROGRESS: '6502a045-2a7d-4bc8-8ba1-36eaedc49a02',
  ON_HOLD: '6502a045-2a7d-4bc8-8ba1-36eaedc49a03',
  COMPLETED: '6502a045-2a7d-4bc8-8ba1-36eaedc49a04',
} as const;
export const FIXED_PROJECT_STATUSES = [
  { id: PROJECT_STATUS_IDS.WAITING, name: 'ממתין', position: 1 },
  { id: PROJECT_STATUS_IDS.IN_PROGRESS, name: 'בעבודה', position: 2 },
  { id: PROJECT_STATUS_IDS.ON_HOLD, name: 'להמתין', position: 3 },
  { id: PROJECT_STATUS_IDS.COMPLETED, name: 'הסתיים', position: 4 },
] as const;
export const PROJECT_STATUS_MIGRATION_MESSAGE =
  'The fixed project statuses are not configured. Apply the 2026-10-16 fixed-project-statuses migration.';
