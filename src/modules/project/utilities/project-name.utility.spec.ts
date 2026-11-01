import { UniqueConstraintError } from 'sequelize';
import { ConflictException } from '@nestjs/common';
import { PROJECT_NAME } from '../constants/project-name.constant';
import { rethrowProjectNameConflict } from './project-name.utility';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';

const uniqueError = (constraint: string) =>
  new UniqueConstraintError({
    parent: Object.assign(new Error('duplicate key'), {
      constraint,
      sql: 'INSERT INTO projects',
    }),
  });

describe('project name domain conflict', () => {
  it('maps only the exact active-name index to an actionable conflict code', () => {
    expect(() =>
      rethrowProjectNameConflict(uniqueError(PROJECT_NAME.UNIQUE_INDEX)),
    ).toThrow(ConflictException);
    try {
      rethrowProjectNameConflict(uniqueError(PROJECT_NAME.UNIQUE_INDEX));
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      if (!(error instanceof ConflictException)) {
        throw error;
      }

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toEqual({
        code: HTTP_ERROR_CODES.PROJECT_NAME_ALREADY_EXISTS,
        message:
          'קיים כבר פרויקט בשם זה. יש לבחור שם אחר (ההשוואה תלוית רישיות)',
      });
    }
  });

  it.each(['projects_code_key', 'uq_customers_tax_id'])(
    'preserves unrelated unique violations %s',
    (constraint) => {
      const error = uniqueError(constraint);
      expect(() => rethrowProjectNameConflict(error)).toThrow(error);
    },
  );

  it('does not mistake a constraint-shaped non-Sequelize error for a name conflict', () => {
    const error = Object.assign(new Error('connection failed'), {
      parent: { constraint: PROJECT_NAME.UNIQUE_INDEX },
    });
    expect(() => rethrowProjectNameConflict(error)).toThrow(error);
  });
});
