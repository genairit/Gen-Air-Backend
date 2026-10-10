export const DRIVE_TEMPLATE_TAGS = {
  PROJECT_ID: '{Project_ID}',
  PROJECT_NAME: '{Project_Name}',
} as const;

export type DriveTemplateTagType =
  (typeof DRIVE_TEMPLATE_TAGS)[keyof typeof DRIVE_TEMPLATE_TAGS];

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ALLOWED_TAG_ALTERNATIVES = Object.values(DRIVE_TEMPLATE_TAGS)
  .map(escapeRegExp)
  .join('|');

export const DRIVE_TEMPLATE_FOLDER_NAME_PATTERN = new RegExp(
  `^(?:[^{}]|${ALLOWED_TAG_ALTERNATIVES})+$`,
);
