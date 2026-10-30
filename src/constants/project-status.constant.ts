export const PROJECT_STATUS_IDS = {
  DRAFT: '6502a045-2a7d-4bc8-8ba1-36eaedc49a00',
  WAITING: '6502a045-2a7d-4bc8-8ba1-36eaedc49a01',
  IN_PROGRESS: '6502a045-2a7d-4bc8-8ba1-36eaedc49a02',
  ON_HOLD: '6502a045-2a7d-4bc8-8ba1-36eaedc49a03',
  COMPLETED: '6502a045-2a7d-4bc8-8ba1-36eaedc49a04',
} as const;
export const FIXED_PROJECT_STATUSES = [
  { id: PROJECT_STATUS_IDS.DRAFT, name: 'טיוטה', position: 0 },
  { id: PROJECT_STATUS_IDS.WAITING, name: 'ממתין', position: 1 },
  { id: PROJECT_STATUS_IDS.IN_PROGRESS, name: 'בעבודה', position: 2 },
  { id: PROJECT_STATUS_IDS.ON_HOLD, name: 'להמתין', position: 3 },
  { id: PROJECT_STATUS_IDS.COMPLETED, name: 'הסתיים', position: 4 },
] as const;
export const PROJECT_STATUS_MIGRATION_MESSAGE =
  'The fixed project statuses are not configured. Apply the fixed-project-statuses and project-task-initialization migrations.';
