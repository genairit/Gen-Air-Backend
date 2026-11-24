import { BadRequestException } from '@nestjs/common';
import { assertUniqueProjectContactRoles } from './project-contact-role.utility';

describe('project contact role validation', () => {
  it('rejects duplicate fixed slots on project and apartment creation', () => {
    expect(() =>
      assertUniqueProjectContactRoles([
        { role: 'architect' },
        { role: 'architect' },
      ]),
    ).toThrow(BadRequestException);
  });

  it('preserves repeated legacy free-text roles without reclassification', () => {
    expect(() =>
      assertUniqueProjectContactRoles([
        { role: 'אדריכל' },
        { role: 'אדריכל' },
        { role: null },
        { role: 'consultant' },
        { role: 'architect' },
      ]),
    ).not.toThrow();
  });
});
