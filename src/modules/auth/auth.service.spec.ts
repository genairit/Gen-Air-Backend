import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import { UserService } from '@Modules/user/user.service';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { SESSION_DURATION_SECONDS } from './constants/auth.constant';
import { authorizedUser } from '../../testing/authorization.fixture';
import { RolePermissionService } from '@Modules/role-permission/role-permission.service';

const createService = async () => {
  const user: IUser = { ...authorizedUser(), passwordHash: 'must-not-leak' };
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('token'),
    verifyAsync: jest.fn().mockResolvedValue({ sub: user.id }),
  };
  const users = {
    findById: jest.fn().mockResolvedValue(user),
    findByCredentials: jest.fn().mockResolvedValue(user),
  };
  const grants = {
    getPermissions: jest.fn().mockResolvedValue([PERMISSIONS.TASKS_CREATE]),
  };
  const module = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: JwtService, useValue: jwt },
      { provide: UserService, useValue: users },
      { provide: RolePermissionService, useValue: grants },
    ],
  }).compile();

  return { service: module.get(AuthService), user, jwt, users, grants };
};

describe('AuthService effective permissions', () => {
  it('returns grants on login and omits credentials from the serialized identity', async () => {
    const { service, user, grants, jwt } = await createService();
    const response = await service.login({
      email: user.email,
      password: 'test-password',
      rememberMe: false,
    });

    expect(response).toMatchObject({
      accessToken: 'token',
      user: { id: user.id, permissions: [PERMISSIONS.TASKS_CREATE] },
    });
    expect(response.user).not.toHaveProperty('passwordHash');
    expect(grants.getPermissions).toHaveBeenCalledWith(user.role);
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: user.id },
      { expiresIn: SESSION_DURATION_SECONDS.STANDARD },
    );
  });

  it('rejects bad login credentials before signing a token or looking up grants', async () => {
    const { service, users, jwt, grants } = await createService();
    users.findByCredentials.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'bad@test.invalid',
        password: 'bad',
        rememberMe: false,
      }),
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

  it('propagates grant lookup failure instead of returning a role-based fallback', async () => {
    const { service, grants } = await createService();
    grants.getPermissions.mockRejectedValue(new Error('database unavailable'));

    await expect(service.authenticate('token')).rejects.toThrow(
      'database unavailable',
    );
  });
});
