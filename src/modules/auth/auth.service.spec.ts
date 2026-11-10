import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import { UserService } from '@Modules/user/user.service';
import { USER_ROLES } from '@Constants/user-role.constant';
import { LoginAttemptService } from './login-attempt.service';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { assertPermissions } from '@Utilities/permission.utility';
import { SESSION_DURATION_SECONDS } from './constants/auth.constant';
import { authorizedUser } from '../../testing/authorization.fixture';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { RolePermissionService } from '@Modules/role-permission/role-permission.service';

const createService = async () => {
  const user: IAuthorizedUser = {
    ...authorizedUser(),
    passwordHash: 'must-not-leak',
    sessionVersion: 0,
  };
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('token'),
    verifyAsync: jest
      .fn()
      .mockResolvedValue({ sub: user.id, sessionVersion: 0 }),
  };
  const users = {
    findById: jest.fn().mockResolvedValue(user),
    findByCredentials: jest.fn().mockResolvedValue(user),
    switchActiveRole: jest.fn().mockResolvedValue({
      ...user,
      role: USER_ROLES.ENGINEER,
      assignedRoles: [USER_ROLES.SYSTEM_ADMIN, USER_ROLES.ENGINEER],
    }),
  };
  const grants = {
    getPermissions: jest.fn().mockResolvedValue([PERMISSIONS.TASKS_CREATE]),
  };
  const attempts = {
    consume: jest.fn().mockImplementation(async () => {}),
    reset: jest.fn().mockImplementation(async () => {}),
  };
  const module = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: JwtService, useValue: jwt },
      { provide: UserService, useValue: users },
      { provide: RolePermissionService, useValue: grants },
      { provide: LoginAttemptService, useValue: attempts },
    ],
  }).compile();

  return {
    service: module.get(AuthService),
    user,
    jwt,
    users,
    grants,
    attempts,
  };
};

describe('AuthService effective permissions', () => {
  it('returns grants on login and omits credentials from the serialized identity', async () => {
    const { service, user, grants, jwt } = await createService();
    const response = await service.login(
      {
        email: user.email,
        password: 'test-password',
        rememberMe: false,
      },
      'caller-1',
    );

    expect(response).toMatchObject({
      accessToken: 'token',
      user: { id: user.id, permissions: [PERMISSIONS.TASKS_CREATE] },
    });
    expect(response.user).not.toHaveProperty('passwordHash');
    expect(grants.getPermissions).toHaveBeenCalledWith(user.role);
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: user.id, sessionVersion: 0 },
      { expiresIn: SESSION_DURATION_SECONDS.STANDARD },
    );
  });

  it('rejects bad login credentials before signing a token or looking up grants', async () => {
    const { service, users, jwt, grants } = await createService();
    users.findByCredentials.mockResolvedValue(null);

    await expect(
      service.login(
        {
          email: 'bad@test.invalid',
          password: 'bad',
          rememberMe: false,
        },
        'caller-1',
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(grants.getPermissions).not.toHaveBeenCalled();
  });

  it('looks up current grants and user identity again with the same token', async () => {
    const { service, grants, users } = await createService();
    grants.getPermissions
      .mockResolvedValueOnce([PERMISSIONS.TASKS_CREATE])
      .mockResolvedValueOnce([]);

    await expect(service.authenticate('token')).resolves.toMatchObject({
      permissions: [PERMISSIONS.TASKS_CREATE],
    });
    await expect(service.authenticate('token')).resolves.toMatchObject({
      permissions: [],
    });
    expect(users.findById).toHaveBeenCalledTimes(2);
  });

  it('uses the database active role on every request instead of a stale token role', async () => {
    const { service, user, users, grants } = await createService();
    const changedUser = {
      ...user,
      role: USER_ROLES.ENGINEER,
      assignedRoles: [USER_ROLES.SYSTEM_ADMIN, USER_ROLES.ENGINEER],
    };
    users.findById.mockResolvedValue(changedUser);
    grants.getPermissions.mockResolvedValue([PERMISSIONS.TASKS_CLAIM]);

    await expect(service.authenticate('token')).resolves.toMatchObject({
      role: USER_ROLES.ENGINEER,
      permissions: [PERMISSIONS.TASKS_CLAIM],
    });
    expect(grants.getPermissions).toHaveBeenCalledWith(USER_ROLES.ENGINEER);
  });

  it('switches roles through the user service and returns current active-role grants', async () => {
    const { service, user, users, grants } = await createService();
    grants.getPermissions.mockResolvedValue([PERMISSIONS.TASKS_CLAIM]);

    await expect(
      service.switchActiveRole(user, USER_ROLES.ENGINEER),
    ).resolves.toMatchObject({
      role: USER_ROLES.ENGINEER,
      permissions: [PERMISSIONS.TASKS_CLAIM],
    });
    expect(users.switchActiveRole).toHaveBeenCalledWith(
      user.id,
      USER_ROLES.ENGINEER,
      user,
    );
    expect(grants.getPermissions).toHaveBeenCalledWith(USER_ROLES.ENGINEER);
  });

  it('exposes purchasing grants after role switch while denying payment actions', async () => {
    const { service, user, users, grants } = await createService();
    users.switchActiveRole.mockResolvedValue({
      ...user,
      role: USER_ROLES.PURCHASING_EXECUTION_MANAGER,
      assignedRoles: [
        USER_ROLES.SYSTEM_ADMIN,
        USER_ROLES.PURCHASING_EXECUTION_MANAGER,
      ],
    });
    grants.getPermissions.mockResolvedValue([
      PERMISSIONS.PURCHASE_ORDERS_APPROVE,
      PERMISSIONS.EXECUTION_HANDOFFS_MANAGE,
    ]);

    const switched = await service.switchActiveRole(
      user,
      USER_ROLES.PURCHASING_EXECUTION_MANAGER,
    );

    expect(grants.getPermissions).toHaveBeenCalledWith(
      USER_ROLES.PURCHASING_EXECUTION_MANAGER,
    );
    expect(() =>
      assertPermissions(switched, PERMISSIONS.PURCHASE_ORDERS_APPROVE),
    ).not.toThrow();
    expect(() =>
      assertPermissions(switched, PERMISSIONS.PAYMENTS_RECORD),
    ).toThrow();
  });

  it('rejects invalid tokens without reading user data or grants', async () => {
    const { service, jwt, users, grants } = await createService();
    jwt.verifyAsync.mockRejectedValue(new Error('bad signature'));

    await expect(service.authenticate('invalid')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(users.findById).not.toHaveBeenCalled();
    expect(grants.getPermissions).not.toHaveBeenCalled();
  });

  it('rejects a deleted or missing user even when the token signature is valid', async () => {
    const { service, users, grants } = await createService();
    users.findById.mockResolvedValue(null);

    await expect(service.authenticate('token')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(grants.getPermissions).not.toHaveBeenCalled();
  });

  it('rejects a token issued before the user password changed', async () => {
    const { service, user, users, grants } = await createService();
    users.findById.mockResolvedValue({ ...user, sessionVersion: 1 });

    await expect(service.authenticate('token')).rejects.toThrow(
      'The session has been revoked',
    );
    expect(grants.getPermissions).not.toHaveBeenCalled();
  });

  it('charges failed logins and clears the attempt count after success', async () => {
    const { service, user, users, attempts } = await createService();
    users.findByCredentials.mockResolvedValueOnce(null);

    await expect(
      service.login({ email: user.email, password: 'bad' }, 'caller-1'),
    ).rejects.toThrow(UnauthorizedException);
    await service.login({ email: user.email, password: 'correct' }, 'caller-1');

    expect(attempts.consume).toHaveBeenCalledTimes(2);
    expect(attempts.consume).toHaveBeenCalledWith(user.email, 'caller-1');
    expect(attempts.reset).toHaveBeenCalledTimes(1);
  });

  it('rejects a user whose active role is no longer assigned', async () => {
    const { service, user, users, grants } = await createService();
    users.findById.mockResolvedValue({ ...user, assignedRoles: [] });

    await expect(service.authenticate('token')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(grants.getPermissions).not.toHaveBeenCalled();
  });

  it('propagates grant lookup failure instead of returning a role-based fallback', async () => {
    const { service, grants } = await createService();
    grants.getPermissions.mockRejectedValue(new Error('database unavailable'));

    await expect(service.authenticate('token')).rejects.toThrow(
      'database unavailable',
    );
  });
});
