import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { UserRepository } from './user.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { GetUsersByFilterDto } from './dto/get-by-filter.dto';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { toCursorBatch } from '@Utilities/cursor-batch.utility';
import { assertPermissions } from '@Utilities/permission.utility';
import { EMPTY_USER_ROLE_COUNTS } from './constants/user.constant';
import { IUser, TUserRoleCounts } from './interfaces/user.interface';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { hashPassword, verifyPassword } from '@Utilities/password.utility';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async getById(id: string): Promise<IUser> {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException(`User ${id} was not found`);
    }

    return user;
  }

  findById(id: string): Promise<IUser | null> {
    return this.userRepository.findById(id);
  }

  findByIds(ids: string[]): Promise<IUser[]> {
    return this.userRepository.findByIds(ids);
  }

  async findByCredentials(
    email: string,
    password: string,
  ): Promise<IUser | null> {
    const credentials = await this.userRepository.findCredentialsByEmail(email);

    if (!credentials) {
      return null;
    }

    const isPasswordValid = await verifyPassword(
      password,
      credentials.passwordHash,
    );

    if (!isPasswordValid) {
      return null;
    }

    return this.userRepository.findById(credentials.id);
  }

  getByFilter(filter: GetUsersByFilterDto): Promise<ICursorPage<IUser>> {
    return this.userRepository.findByFilter(
      { search: filter.search ?? null, role: filter.role ?? null },
      toCursorBatch(filter),
    );
  }

  async getRoleCounts(): Promise<TUserRoleCounts> {
    const roleCounts = await this.userRepository.countByRole();

    return roleCounts.reduce<TUserRoleCounts>(
      (counts, { role, count }) => ({ ...counts, [role]: count }),
      EMPTY_USER_ROLE_COUNTS,
    );
  }

  createForActor(input: CreateUserDto, actor: IAuthorizedUser): Promise<IUser> {
    assertPermissions(
      actor,
      PERMISSIONS.EMPLOYEES_CREATE,
      PERMISSIONS.EMPLOYEES_ROLES_ASSIGN,
    );

    return this.create(input);
  }

  updateForActor(
    id: string,
    input: UpdateUserDto,
    actor: IAuthorizedUser,
  ): Promise<IUser> {
    assertPermissions(actor, PERMISSIONS.EMPLOYEES_UPDATE);
    if ('role' in input) {
      assertPermissions(actor, PERMISSIONS.EMPLOYEES_ROLES_ASSIGN);
    }

    return this.update(id, input);
  }

  async create(user: CreateUserDto): Promise<IUser> {
    await this.assertEmailAvailable(user.email);

    const passwordHash = await hashPassword(user.password);

    const createdUser = await this.userRepository.create({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      passwordHash,
    });

    return this.getById(createdUser.id);
  }

  async update(id: string, changes: UpdateUserDto): Promise<IUser> {
    const user = await this.getById(id);
    const requestedEmail = changes.email ?? null;
    const isEmailChanging =
      requestedEmail !== null &&
      requestedEmail.toLowerCase() !== user.email.toLowerCase();

    if (isEmailChanging) {
      await this.assertEmailAvailable(requestedEmail);
    }

    await this.userRepository.update(id, changes);

    return this.getById(id);
  }

  async updatePassword(
    userId: string,
    changes: UpdateUserPasswordDto,
  ): Promise<void> {
    const passwordHash = await hashPassword(changes.password);
    const isUpdated = await this.userRepository.updatePasswordHash(
      userId,
      passwordHash,
    );

    if (!isUpdated) {
      throw new NotFoundException(`User ${userId} was not found`);
    }
  }

  async delete(id: string, requester: IUser): Promise<void> {
    if (id === requester.id) {
      throw new BadRequestException('You cannot delete your own user');
    }

    const isDeleted = await this.userRepository.softDelete(id);

    if (!isDeleted) {
      throw new NotFoundException(`User ${id} was not found`);
    }
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existingUser =
      await this.userRepository.findByEmailIncludingDeleted(email);

    if (existingUser) {
      throw new ConflictException(`The email ${email} is already in use`);
    }
  }
}
