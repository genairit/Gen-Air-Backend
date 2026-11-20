import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';
import { plainToInstance } from 'class-transformer';
import { SwitchUserRoleDto } from './switch-user-role.dto';
import { USER_ROLES } from '@Constants/user-role.constant';

describe('Employee role request boundaries', () => {
  it('rejects the legacy sales role in create, edit and switch requests', async () => {
    const create = plainToInstance(CreateUserDto, {
      firstName: 'Test',
      lastName: 'Employee',
      email: 'employee@test.invalid',
      phone: '0500000000',
      password: 'Test-only-password-123',
      assignedRoles: [USER_ROLES.SALES_AGENT],
    });
    const update = plainToInstance(UpdateUserDto, {
      assignedRoles: [USER_ROLES.SALES_AGENT],
    });
    const activeRole = plainToInstance(SwitchUserRoleDto, {
      role: USER_ROLES.SALES_AGENT,
    });

    expect(
      (await validate(create)).some(
        ({ property }) => property === 'assignedRoles',
      ),
    ).toBe(true);
    expect(
      (await validate(update)).some(
        ({ property }) => property === 'assignedRoles',
      ),
    ).toBe(true);
    expect(
      (await validate(activeRole)).some(({ property }) => property === 'role'),
    ).toBe(true);
  });

  it('rejects a separately selected active role during creation', async () => {
    const request = plainToInstance(CreateUserDto, {
      firstName: 'Test',
      lastName: 'Employee',
      email: 'employee@test.invalid',
      phone: '0500000000',
      password: 'Test-only-password-123',
      assignedRoles: [USER_ROLES.ENGINEER],
      role: USER_ROLES.FINANCE,
    });

    const errors = await validate(request, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('rejects a separately selected active role during an edit', async () => {
    const request = plainToInstance(UpdateUserDto, {
      assignedRoles: [USER_ROLES.ENGINEER],
      role: USER_ROLES.FINANCE,
    });

    const errors = await validate(request, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });
});
