import {
  DRIVE_FOLDER_LINK,
  DRIVE_FOLDER_LINK_ERROR_CODES,
} from '@Modules/project-drive-link/constants/drive-folder-link.constant';

import { UniqueConstraintError } from 'sequelize';
import { ConflictException } from '@nestjs/common';
import { PROJECT_NAME } from '../constants/project-name.constant';
import { rethrowProjectWriteConflict } from './project-write-conflict.utility';

const uniqueError = (constraint: string): UniqueConstraintError =>
  new UniqueConstraintError({
    parent: Object.assign(new Error('duplicate key'), {
      constraint,
      sql: 'INSERT INTO projects',
    }),
  });

describe('project write identity conflicts', () => {
  it('maps a Drive folder collision to the stable actionable conflict code', () => {
    expect.assertions(2);
    try {
      rethrowProjectWriteConflict(uniqueError(DRIVE_FOLDER_LINK.UNIQUE_INDEX));
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      if (!(error instanceof ConflictException)) {
        throw error;
      }

      expect(error.getResponse()).toMatchObject({
        code: DRIVE_FOLDER_LINK_ERROR_CODES.ALREADY_LINKED,
      });
    }
  });

  it('retains project name conflict handling', () => {
    expect(() =>
      rethrowProjectWriteConflict(uniqueError(PROJECT_NAME.UNIQUE_INDEX)),
    ).toThrow(ConflictException);
  });

  it('does not relabel unrelated database errors', () => {
    const failure = new Error('unrelated database failure');
    expect(() => rethrowProjectWriteConflict(failure)).toThrow(failure);
  });
});
