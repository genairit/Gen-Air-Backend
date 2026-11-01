import { Test } from '@nestjs/testing';
import { USER_ROLES } from '@Constants/user-role.constant';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { RolePermissionService } from './role-permission.service';
import { RolePermissionRepository } from './role-permission.repository';

const createService = async () => {
  const repository = { findKeysByRole: jest.fn<Promise<string[]>, [string]>() };
  const module = await Test.createTestingModule({
    providers: [
      RolePermissionService,
      { provide: RolePermissionRepository, useValue: repository },
    ],
  }).compile();

  return { service: module.get(RolePermissionService), repository };
};

describe('RolePermissionService', () => {
  it('returns only registered granted permissions and removes duplicates', async () => {
    const { service, repository } = await createService();
    repository.findKeysByRole.mockResolvedValue([
      PERMISSIONS.TASKS_ASSIGN,
      'unregistered.grant',
      PERMISSIONS.TASKS_ASSIGN,
    ]);

    await expect(service.getPermissions(USER_ROLES.SECRETARY)).resolves.toEqual(
      [PERMISSIONS.TASKS_ASSIGN],
    );
    expect(repository.findKeysByRole).toHaveBeenCalledWith(
      USER_ROLES.SECRETARY,
    );
  });

  it('does not give administrators implicit privileges when the grant table is empty', async () => {
    const { service, repository } = await createService();
    repository.findKeysByRole.mockResolvedValue([]);

    await expect(
      service.getPermissions(USER_ROLES.SYSTEM_ADMIN),
    ).resolves.toEqual([]);
  });

  it('reads grants again for every request rather than retaining a stale grant', async () => {
    const { service, repository } = await createService();
    repository.findKeysByRole
      .mockResolvedValueOnce([PERMISSIONS.CUSTOMERS_CREATE])
      .mockResolvedValueOnce([]);

    await expect(service.getPermissions(USER_ROLES.SECRETARY)).resolves.toEqual(
      [PERMISSIONS.CUSTOMERS_CREATE],
    );
    await expect(service.getPermissions(USER_ROLES.SECRETARY)).resolves.toEqual(
      [],
    );
    expect(repository.findKeysByRole).toHaveBeenCalledTimes(2);
  });

  it('propagates database failure instead of falling back to role defaults', async () => {
    const { service, repository } = await createService();
    const failure = new Error('database unavailable');
    repository.findKeysByRole.mockRejectedValue(failure);

    await expect(
      service.getPermissions(USER_ROLES.SYSTEM_ADMIN),
    ).rejects.toThrow(failure);
  });
});
