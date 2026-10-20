import { Test } from '@nestjs/testing';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { IUser } from './interfaces/user.interface';
import { USER_ROLES } from '@Constants/user-role.constant';
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
