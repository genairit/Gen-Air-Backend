import {
  USER_ROLES,
  PROJECT_MEMBER_ROLES,
} from '@Constants/user-role.constant';

import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AssignProjectMemberDto } from './assign-project-member.dto';

const USER_ID = '00000000-0000-4000-8000-000000000001';

const findInvalidFields = async (role: string): Promise<string[]> => {
  const errors = await validate(
    plainToInstance(AssignProjectMemberDto, { userId: USER_ID, role }),
  );

  return errors.map((error) => error.property);
};

describe('AssignProjectMemberDto', () => {
  it.each(PROJECT_MEMBER_ROLES)('accepts the %s project slot', async (role) => {
    await expect(findInvalidFields(role)).resolves.toEqual([]);
  });

  it.each([USER_ROLES.SYSTEM_ADMIN, USER_ROLES.FINANCE, 'lead_installer'])(
    'rejects %s, which is not a project slot',
    async (role) => {
      await expect(findInvalidFields(role)).resolves.toEqual(['role']);
    },
  );
});
