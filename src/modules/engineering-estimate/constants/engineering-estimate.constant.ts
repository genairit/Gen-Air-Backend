export const ESTIMATE_SCOPE = {
  HVAC: 'hvac',
  VENTILATION: 'hvac_ventilation',
  INSTALLATION: 'installation_only',
  FLOOR_HEATING: 'hvac_floor_heating',
} as const;

export const ESTIMATE_SETUP_STEP = {
  PROJECT: 'project',
  PLANS: 'plans',
  SCOPE: 'scope',
  AREAS: 'areas',
  COMPLETE: 'complete',
} as const;

export const ESTIMATE_STATUS = {
  DRAFT: 'draft',
  SKETCH: 'sketch',
  APPROVED: 'approved',
} as const;

export const ESTIMATE_LINE_SOURCE = { MANUAL: 'manual', RULE: 'rule' } as const;

export const ESTIMATE_DOCUMENT_KIND = {
  SKETCH: 'sketch',
  PROPOSAL: 'proposal',
  BOQ: 'boq',
} as const;

export const ESTIMATE_LIMITS = {
  NAME: 250,
  SOURCE: 500,
  QUESTIONS: 50,
  AREAS: 50,
  AREA_LINES: 100,
  TOTAL_LINES: 200,
  PLANS: 10,
  PLAN_BYTES: 4 * 1024 * 1024,
  MARKED_BYTES: 512 * 1024,
  MAX_REPEATS: 10000,
  MAX_QUANTITY: 999999,
} as const;

export const ESTIMATE_PLAN_MIME = {
  PDF: 'application/pdf',
  PNG: 'image/png',
  JPEG: 'image/jpeg',
} as const;
