import { tmpdir } from 'node:os';
import { BYTE_UNITS } from '@Constants/size.constant';
import { DRIVE_TEMPLATE_TAGS } from '@Constants/drive-template.constant';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

export const PROJECT_ROOT_FOLDER_NAME = `${DRIVE_TEMPLATE_TAGS.PROJECT_ID}_${DRIVE_TEMPLATE_TAGS.PROJECT_NAME}`;

export const MAX_FOLDER_DEPTH = 10;

export const UPLOAD_LIMITS = {
  FIELD_NAME: 'files',
  MAX_FILES: 20,
  MAX_FILE_SIZE_BYTES: 250 * BYTE_UNITS.MEGABYTE,
} as const;

export const UPLOAD_OPTIONS: MulterOptions = {
  dest: tmpdir(),
  limits: { fileSize: UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES },
};
