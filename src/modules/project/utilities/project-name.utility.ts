import { UniqueConstraintError } from 'sequelize';
import { ConflictException } from '@nestjs/common';
import { PROJECT_NAME } from '../constants/project-name.constant';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { getHttpErrorPayload } from '@Utilities/http-error-payload.utility';

export const rethrowProjectNameConflict = (error: unknown): never => {
  const isUniqueError = error instanceof UniqueConstraintError;
  const constraint: unknown = isUniqueError
    ? Reflect.get(error.parent, 'constraint')
    : null;
  if (constraint === PROJECT_NAME.UNIQUE_INDEX) {
    throw new ConflictException(
      getHttpErrorPayload(HTTP_ERROR_CODES.PROJECT_NAME_ALREADY_EXISTS),
    );
  }

  throw error;
};
