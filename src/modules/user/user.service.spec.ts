import { Test } from '@nestjs/testing';
import { Transaction } from 'sequelize';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { ForbiddenException } from '@nestjs/common';
import type { IUser } from './interfaces/user.interface';
import { USER_ROLES } from '@Constants/user-role.constant';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { authorizedUser } from '../../testing/authorization.fixture';
import { UserRoleService } from '@Modules/user-role/user-role.service';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { UserRoleAuditService } from '@Modules/user-role-audit/user-role-audit.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { USER_ROLE_AUDIT_ACTIONS } from '@Modules/user-role-audit/constants/user-role-audit.constant';

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
  const transaction = Transaction.prototype;
  const userRepository = {
    create: jest.fn().mockResolvedValue(USER),
    update: jest.fn().mockResolvedValue(true),
    findById: jest.fn().mockResolvedValue(USER),
    softDelete: jest.fn().mockResolvedValue(true),
    findByEmailIncludingDeleted: jest.fn().mockResolvedValue(null),
    findByFilter: jest
      .fn()
      .mockResolvedValue({ items: [USER], nextCursor: null }),
    countActiveByIds: jest
      .fn()
      .mockImplementation((userIds: string[]) => userIds.length),
    countActiveUsers: jest.fn().mockResolvedValue(6),
  };
  const userRoleService = {
    getAssignedRolesByUserIds: jest
      .fn()
      .mockResolvedValue(new Map([[USER.id, [USER.role]]])),
    findUserIdsByRole: jest
      .fn()
      .mockImplementation((role: string) =>
        Promise.resolve(
          role === USER_ROLES.SECRETARY ? ['user-1', 'user-2'] : [],
        ),
      ),
    replaceForUser: jest.fn().mockImplementation(() => Promise.resolve()),
    create: jest.fn().mockImplementation(() => Promise.resolve()),
  };
  const userRoleAuditService = {
    record: jest.fn().mockImplementation(() => Promise.resolve()),
  };
  const transactions = {
    run: jest
      .fn()
      .mockImplementation(
        (work: (transaction: Transaction) => Promise<unknown>) =>
          work(transaction),
      ),
    lockKey: jest.fn().mockImplementation(() => Promise.resolve()),
    markRoleMembershipManaged: jest
      .fn()
      .mockImplementation(() => Promise.resolve()),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      UserService,
      { provide: UserRepository, useValue: userRepository },
      { provide: UserRoleService, useValue: userRoleService },
      { provide: UserRoleAuditService, useValue: userRoleAuditService },
      { provide: DatabaseTransactionService, useValue: transactions },
    ],
  }).compile();

  return {
    service: moduleRef.get(UserService),
    userRepository,
    userRoleService,
    userRoleAuditService,
    transactions,
    transaction,
  };
};

describe('UserService.update', () => {
  it('does not treat a change in email letter case as a conflict', async () => {
    const { service, userRepository } = await createService();
    userRepository.findByEmailIncludingDeleted.mockResolvedValue(USER);

    await service.update(
      USER.id,
      { email: 'Michal@Gen-Air.co.il' },
      authorizedUser(),
    );

    expect(userRepository.findByEmailIncludingDeleted).not.toHaveBeenCalled();
  });

  it('rejects an email that belongs to another employee', async () => {
    const { service, userRepository } = await createService();
    userRepository.findByEmailIncludingDeleted.mockResolvedValue({ id: 'x' });

    await expect(
      service.update(
        USER.id,
        { email: 'roman.l@gen-air.co.il' },
        authorizedUser(),
      ),
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
      total: 6,
    });
  });

  it('filters users by assigned membership instead of their active role', async () => {
    const { service, userRepository, userRoleService } = await createService();
    const roleMemberIds = ['multi-role-user'];
    userRoleService.findUserIdsByRole.mockResolvedValue(roleMemberIds);

    await service.getByFilter({ role: USER_ROLES.ENGINEER });

    expect(userRoleService.findUserIdsByRole).toHaveBeenCalledWith(
      USER_ROLES.ENGINEER,
    );
    expect(userRepository.findByFilter).toHaveBeenCalledWith(
      { search: null },
      expect.objectContaining({ batchCursor: null }),
      roleMemberIds,
    );
  });
});

describe('UserService.delete', () => {
  it('prevents deleting your own user', async () => {
    const { service } = await createService();

    await expect(
      service.delete(USER.id, { ...authorizedUser(), id: USER.id }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('UserService field-specific actor permissions', () => {
  const input = {
    firstName: 'Test',
    lastName: 'Employee',
    email: 'employee@test.invalid',
    phone: '0500000000',
    assignedRoles: [USER_ROLES.ENGINEER],
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
    expect(create).toHaveBeenCalledWith(input, actor);
  });

  it('uses the first assigned role as the initial active role', async () => {
    const { service, userRepository, userRoleAuditService, transaction } =
      await createService();
    const actor = authorizedUser([
      PERMISSIONS.EMPLOYEES_CREATE,
      PERMISSIONS.EMPLOYEES_ROLES_ASSIGN,
    ]);
    const assignedRoles = [USER_ROLES.ENGINEER, USER_ROLES.FINANCE];

    await service.createForActor({ ...input, assignedRoles }, actor);

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: USER_ROLES.ENGINEER }),
      transaction,
    );
    expect(userRoleAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ nextRole: USER_ROLES.ENGINEER }),
      transaction,
    );
  });

  it('rejects creation without an assigned role', async () => {
    const { service, userRepository } = await createService();
    const actor = authorizedUser([
      PERMISSIONS.EMPLOYEES_CREATE,
      PERMISSIONS.EMPLOYEES_ROLES_ASSIGN,
    ]);

    await expect(
      service.createForActor({ ...input, assignedRoles: [] }, actor),
    ).rejects.toThrow(BadRequestException);
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('permits ordinary profile changes without granting role assignment', async () => {
    const { service } = await createService();
    const update = jest.spyOn(service, 'update').mockResolvedValue(USER);
    const actor = authorizedUser([PERMISSIONS.EMPLOYEES_UPDATE]);

    await expect(
      service.updateForActor(USER.id, { phone: '0500000001' }, actor),
    ).resolves.toEqual(USER);
    expect(update).toHaveBeenCalledWith(
      USER.id,
      { phone: '0500000001' },
      actor,
    );
  });

  it('rejects assigned roles inside an otherwise permitted profile update', async () => {
    const { service } = await createService();
    const update = jest.spyOn(service, 'update').mockResolvedValue(USER);
    const actor = authorizedUser([PERMISSIONS.EMPLOYEES_UPDATE]);

    expect(() =>
      service.updateForActor(
        USER.id,
        { assignedRoles: [USER_ROLES.SYSTEM_ADMIN] },
        actor,
      ),
    ).toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('accepts assigned-role changes when role assignment is explicitly granted', async () => {
    const { service } = await createService();
    const update = jest.spyOn(service, 'update').mockResolvedValue(USER);
    const actor = authorizedUser([
      PERMISSIONS.EMPLOYEES_UPDATE,
      PERMISSIONS.EMPLOYEES_ROLES_ASSIGN,
    ]);

    const changes = {
      assignedRoles: [USER_ROLES.ENGINEER],
    };

    await expect(
      service.updateForActor(USER.id, changes, actor),
    ).resolves.toEqual(USER);
    expect(update).toHaveBeenCalledWith(USER.id, changes, actor);
  });

  it('requires profile-update permission even if role assignment is present', async () => {
    const { service } = await createService();
    const update = jest.spyOn(service, 'update').mockResolvedValue(USER);

    expect(() =>
      service.updateForActor(
        USER.id,
        { assignedRoles: [USER_ROLES.ENGINEER] },
        authorizedUser([PERMISSIONS.EMPLOYEES_ROLES_ASSIGN]),
      ),
    ).toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('UserService role membership integrity', () => {
  const roleAdministrator = authorizedUser([
    PERMISSIONS.EMPLOYEES_UPDATE,
    PERMISSIONS.EMPLOYEES_ROLES_ASSIGN,
  ]);

  it('keeps the current active role when it remains assigned', async () => {
    const { service, userRepository, transaction } = await createService();

    await service.update(
      USER.id,
      { assignedRoles: [USER_ROLES.ENGINEER, USER_ROLES.SECRETARY] },
      roleAdministrator,
    );

    expect(userRepository.update).toHaveBeenCalledWith(
      USER.id,
      expect.objectContaining({ role: USER_ROLES.SECRETARY }),
      transaction,
    );
  });

  it('falls back to an assigned role when the active role is removed and audits the snapshots', async () => {
    const {
      service,
      userRepository,
      userRoleService,
      userRoleAuditService,
      transaction,
    } = await createService();
    const assignedRoles = [USER_ROLES.ENGINEER];

    await service.update(USER.id, { assignedRoles }, roleAdministrator);

    expect(userRepository.update).toHaveBeenCalledWith(
      USER.id,
      expect.objectContaining({ role: USER_ROLES.ENGINEER }),
      transaction,
    );
    expect(userRoleService.replaceForUser).toHaveBeenCalledWith(
      USER.id,
      assignedRoles,
      transaction,
    );
    expect(userRoleAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        previousRole: USER_ROLES.SECRETARY,
        nextRole: USER_ROLES.ENGINEER,
        previousAssignedRoles: [USER_ROLES.SECRETARY],
        nextAssignedRoles: [USER_ROLES.ENGINEER],
      }),
      transaction,
    );
  });

  it('rejects empty or duplicate assigned role sets', async () => {
    const { service } = await createService();

    await expect(
      service.update(USER.id, { assignedRoles: [] }, roleAdministrator),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.update(
        USER.id,
        { assignedRoles: [USER_ROLES.ENGINEER, USER_ROLES.ENGINEER] },
        roleAdministrator,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('switches only to a currently assigned role and records the active-role snapshot', async () => {
    const {
      service,
      userRepository,
      userRoleService,
      userRoleAuditService,
      transaction,
    } = await createService();
    const assignedRoles = [USER_ROLES.ENGINEER, USER_ROLES.SECRETARY];
    userRoleService.getAssignedRolesByUserIds.mockResolvedValue(
      new Map([[USER.id, assignedRoles]]),
    );

    await service.switchActiveRole(
      USER.id,
      USER_ROLES.ENGINEER,
      roleAdministrator,
    );

    expect(userRepository.update).toHaveBeenCalledWith(
      USER.id,
      { role: USER_ROLES.ENGINEER },
      transaction,
    );
    expect(userRoleAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: USER_ROLE_AUDIT_ACTIONS.SWITCH,
        previousRole: USER_ROLES.SECRETARY,
        nextRole: USER_ROLES.ENGINEER,
        previousAssignedRoles: assignedRoles,
        nextAssignedRoles: assignedRoles,
      }),
      transaction,
    );
  });

  it('rejects switching to an unassigned role without writing changes', async () => {
    const { service, userRepository, userRoleAuditService } =
      await createService();

    await expect(
      service.switchActiveRole(USER.id, USER_ROLES.ENGINEER, roleAdministrator),
    ).rejects.toThrow(BadRequestException);
    expect(userRepository.update).not.toHaveBeenCalled();
    expect(userRoleAuditService.record).not.toHaveBeenCalled();
  });

  it('locks final-administrator removal and rejects it when no other admin remains', async () => {
    const { service, userRepository, userRoleService, transactions } =
      await createService();
    const administrator = { ...USER, role: USER_ROLES.SYSTEM_ADMIN };
    userRepository.findById.mockResolvedValue(administrator);
    userRepository.countActiveByIds.mockResolvedValue(0);
    userRoleService.getAssignedRolesByUserIds.mockResolvedValue(
      new Map([[USER.id, [USER_ROLES.SYSTEM_ADMIN]]]),
    );
    userRoleService.findUserIdsByRole.mockResolvedValue([USER.id]);

    await expect(
      service.update(
        USER.id,
        { assignedRoles: [USER_ROLES.ENGINEER] },
        roleAdministrator,
      ),
    ).rejects.toThrow(ConflictException);

    expect(transactions.lockKey).toHaveBeenCalledTimes(1);
    expect(transactions.lockKey.mock.invocationCallOrder[0]).toBeLessThan(
      userRoleService.findUserIdsByRole.mock.invocationCallOrder[0],
    );
    expect(userRepository.update).not.toHaveBeenCalled();
  });
});
