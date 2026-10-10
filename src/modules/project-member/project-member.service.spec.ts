import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UserService } from '@Modules/user/user.service';
import { USER_ROLES } from '@Constants/user-role.constant';
import { ProjectMemberService } from './project-member.service';
import { ProjectMemberRepository } from './project-member.repository';

const SECRETARY_ID = 'secretary-user';
const INSTALLER_ID = 'installer-user';

const createService = async () => {
  const userService = {
    findByIds: jest.fn().mockResolvedValue([
      { id: SECRETARY_ID, role: USER_ROLES.SECRETARY },
      { id: INSTALLER_ID, role: USER_ROLES.LEAD_INSTALLER },
    ]),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ProjectMemberService,
      { provide: UserService, useValue: userService },
      { provide: ProjectMemberRepository, useValue: {} },
    ],
  }).compile();

  return moduleRef.get(ProjectMemberService);
};

describe('ProjectMemberService.validateAssignments', () => {
  it('accepts employees assigned to their own role', async () => {
    const service = await createService();

    await expect(
      service.validateAssignments([
        { userId: SECRETARY_ID, role: USER_ROLES.SECRETARY },
        { userId: INSTALLER_ID, role: USER_ROLES.LEAD_INSTALLER },
      ]),
    ).resolves.toBeUndefined();
  });

  it('rejects the same role assigned twice', async () => {
    const service = await createService();

    await expect(
      service.validateAssignments([
        { userId: SECRETARY_ID, role: USER_ROLES.SECRETARY },
        { userId: INSTALLER_ID, role: USER_ROLES.SECRETARY },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an employee assigned to a role they do not hold', async () => {
    const service = await createService();

    await expect(
      service.validateAssignments([
        { userId: INSTALLER_ID, role: USER_ROLES.PROJECT_MANAGER },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an employee that does not exist', async () => {
    const service = await createService();

    await expect(
      service.validateAssignments([
        { userId: 'missing-user', role: USER_ROLES.SECRETARY },
      ]),
    ).rejects.toThrow(BadRequestException);
  });
});
