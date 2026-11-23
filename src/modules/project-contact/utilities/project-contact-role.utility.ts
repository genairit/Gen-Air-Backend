import {
  PROJECT_CONTACT_ROLE_VALUES,
  type ProjectContactRoleType,
} from '../constants/project-contact-role.constant';

import { BadRequestException } from '@nestjs/common';

export const isProjectContactRole = (
  role?: string | null,
): role is ProjectContactRoleType =>
  PROJECT_CONTACT_ROLE_VALUES.some((value) => value === role);

export const assertUniqueProjectContactRoles = (
  contacts: readonly { role?: string | null }[],
): void => {
  const roles = contacts
    .map((contact) => contact.role)
    .filter(isProjectContactRole);
  if (new Set(roles).size !== roles.length) {
    throw new BadRequestException(
      'Each project contact role can be assigned once',
    );
  }
};
