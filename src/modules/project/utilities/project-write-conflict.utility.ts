import {
  DRIVE_FOLDER_LINK,
  DRIVE_FOLDER_LINK_ERROR_CODES,
} from '@Modules/project-drive-link/constants/drive-folder-link.constant';

import { UniqueConstraintError } from 'sequelize';
import { ConflictException } from '@nestjs/common';
import { rethrowProjectNameConflict } from './project-name.utility';

export const rethrowProjectWriteConflict = (error: unknown): never => {
  const constraint: unknown =
    error instanceof UniqueConstraintError
      ? Reflect.get(error.parent, 'constraint')
      : null;
  if (constraint === DRIVE_FOLDER_LINK.UNIQUE_INDEX) {
    throw new ConflictException({
      code: DRIVE_FOLDER_LINK_ERROR_CODES.ALREADY_LINKED,
      message: 'התיקייה כבר משויכת לפרויקט אחר. יש לבחור תיקייה נפרדת',
    });
  }

  return rethrowProjectNameConflict(error);
};
