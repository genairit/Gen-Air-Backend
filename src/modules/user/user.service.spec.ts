import { Test } from '@nestjs/testing';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { ForbiddenException } from '@nestjs/common';
import { IUser } from './interfaces/user.interface';
import { USER_ROLES } from '@Constants/user-role.constant';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { authorizedUser } from '../../testing/authorization.fixture';
import { ConflictException, BadRequestException } from '@nestjs/common';

const USER: IUser = {
  id: 'user-1',
  deletedAt: null,
  firstName: 'מיכל',
  lastName: 'רוזנברג',
  phone: '054-7712094',
  employeeNumber: 'EMP-1002',
  role: USER_ROLES.SECRETARY,
  email: 'michal@gen-air.co.il',
  createdAt: new Date('2026-10-07T00:00:00.000Z'),
  updatedAt: new Date('2026-10-07T00:00:00.000Z'),
};

const createService = async () => {
  const userRepository = {
    update: jest.fn().mockResolvedValue(true),
    findById: jest.fn().mockResolvedValue(USER),
    softDelete: jest.fn().mockResolvedValue(true),
    findByEmailIncludingDeleted: jest.fn().mockResolvedValue(null),
    countByRole: jest
      .fn()
      .mockResolvedValue([{ role: USER_ROLES.SECRETARY, count: 2 }]),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      UserService,
      { provide: UserRepository, useValue: userRepository },
    ],
  }).compile();

  return { service: moduleRef.get(UserService), userRepository };
};

describe('UserService.update', () => {
  it('does not treat a change in email letter case as a conflict', async () => {
    const { service, userRepository } = await createService();
    userRepository.findByEmailIncludingDeleted.mockResolvedValue(USER);

    await service.update(USER.id, { email: 'Michal@Gen-Air.co.il' });

    expect(userRepository.findByEmailIncludingDeleted).not.toHaveBeenCalled();
  });

  it('rejects an email that belongs to another employee', async () => {
    const { service, userRepository } = await createService();
    userRepository.findByEmailIncludingDeleted.mockResolvedValue({ id: 'x' });

    await expect(
      service.update(USER.id, { email: 'roman.l@gen-air.co.il' }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('UserService.getRoleCounts', () => {
  it('fills roles without employees with zero', async () => {
    const { service } = await createService();

    await expect(service.getRoleCounts()).resolves.toEqual({
      [USER_ROLES.FINANCE]: 0,
      [USER_ROLES.ENGINEER]: 0,
      [USER_ROLES.INSTALLER]: 0,
      [USER_ROLES.SECRETARY]: 2,
      [USER_ROLES.SYSTEM_ADMIN]: 0,
      [USER_ROLES.PROJECT_MANAGER]: 0,
    });
  });
});

describe('UserService.delete', () => {
  it('prevents deleting your own user', async () => {
    const { service } = await createService();

    await expect(service.delete(USER.id, USER)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('UserService field-specific actor permissions', () => {
  const input = {
    firstName: 'Test',
    lastName: 'Employee',
    email: 'employee@test.invalid',
    phone: '0500000000',
    role: USER_ROLES.ENGINEER,
    password: 'Test-only-password-123',
  };

  it('does not permit assigning an account role with only create permission', async () => {
    const { service } = await createService();
    const create = jest.spyOn(service, 'create').mockResolvedValue(USER);

    expect(() =>
      service.createForActor(
        input,
        authorizedUser([PERMISSIONS.EMPLOYEES_CREATE]),
      ),
    ).toThrow(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates an employee only when both create and role-assignment grants are present', async () => {
    const { service } = await createService();
    const create = jest.spyOn(service, 'create').mockResolvedValue(USER);
    const actor = authorizedUser([
      PERMISSIONS.EMPLOYEES_CREATE,
      PERMISSIONS.EMPLOYEES_ROLES_ASSIGN,
    ]);

    await expect(service.createForActor(input, actor)).resolves.toEqual(USER);
    expect(create).toHaveBeenCalledWith(input);
  });

  it('permits ordinary profile changes without granting role assignment', async () => {
    const { service } = await createService();
    const update = jest.spyOn(service, 'update').mockResolvedValue(USER);
    const actor = authorizedUser([PERMISSIONS.EMPLOYEES_UPDATE]);

    await expect(
      service.updateForActor(USER.id, { phone: '0500000001' }, actor),
    ).resolves.toEqual(USER);
    expect(update).toHaveBeenCalledWith(USER.id, { phone: '0500000001' });
  });

  it('rejects a role field inside an otherwise permitted profile update', async () => {
    const { service } = await createService();
    const update = jest.spyOn(service, 'update').mockResolvedValue(USER);
    const actor = authorizedUser([PERMISSIONS.EMPLOYEES_UPDATE]);

    expect(() =>
      service.updateForActor(USER.id, { role: USER_ROLES.SYSTEM_ADMIN }, actor),
    ).toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('accepts a role update when role assignment is explicitly granted', async () => {
    const { service } = await createService();
    const update = jest.spyOn(service, 'update').mockResolvedValue(USER);
    const actor = authorizedUser([
      PERMISSIONS.EMPLOYEES_UPDATE,
      PERMISSIONS.EMPLOYEES_ROLES_ASSIGN,
    ]);

    await expect(
      service.updateForActor(USER.id, { role: USER_ROLES.ENGINEER }, actor),
    ).resolves.toEqual(USER);
    expect(update).toHaveBeenCalledWith(USER.id, { role: USER_ROLES.ENGINEER });
  });

  it('requires profile-update permission even if role assignment is present', async () => {
    const { service } = await createService();
    const update = jest.spyOn(service, 'update').mockResolvedValue(USER);

    expect(() =>
      service.updateForActor(
        USER.id,
        { role: USER_ROLES.ENGINEER },
        authorizedUser([PERMISSIONS.EMPLOYEES_ROLES_ASSIGN]),
      ),
    ).toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });
});
