import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  USER_ROLE_LOCK_KEYS,
  EMPTY_USER_ROLE_COUNTS,
} from './constants/user.constant';

import {
  IUser,
  TUserRoleCounts,
  TUserUpdateAttributes,
} from './interfaces/user.interface';

import {
  hashPassword,
  verifyPassword,
  isBlockedPassword,
} from '@Utilities/password.utility';

import {
  USER_ROLES,
  UserRoleType,
  USER_ROLE_VALUES,
} from '@Constants/user-role.constant';

import { Transaction } from 'sequelize';
import { User } from './entities/user.entity';
import { UserRepository } from './user.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { GetUsersByFilterDto } from './dto/get-by-filter.dto';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { toCursorBatch } from '@Utilities/cursor-batch.utility';
import { assertPermissions } from '@Utilities/permission.utility';
import { DUMMY_PASSWORD_HASH } from '@Constants/password.constant';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { UserRoleService } from '@Modules/user-role/user-role.service';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { UserRoleAuditService } from '@Modules/user-role-audit/user-role-audit.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { USER_ROLE_AUDIT_ACTIONS } from '@Modules/user-role-audit/constants/user-role-audit.constant';

const hasSameRoles = (
  currentRoles: UserRoleType[],
  nextRoles: UserRoleType[],
): boolean =>
  currentRoles.length === nextRoles.length &&
  currentRoles.every((role) => nextRoles.includes(role));

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userRoleService: UserRoleService,
    private readonly userRoleAuditService: UserRoleAuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  async getById(id: string): Promise<IUser> {
    const user = await this.findById(id);

    if (!user) {
      throw new NotFoundException(`User ${id} was not found`);
    }

    return user;
  }

  async findById(id: string): Promise<IUser | null> {
    const user = await this.userRepository.findById(id);

    if (!user) {
      return null;
    }

    const [assignedUser] = await this.addAssignedRoles([user]);

    return assignedUser ?? null;
  }

  async findByIds(ids: string[]): Promise<IUser[]> {
    const users = await this.userRepository.findByIds(ids);

    return this.addAssignedRoles(users);
  }

  async findByCredentials(
    email: string,
    password: string,
  ): Promise<IUser | null> {
    const credentials = await this.userRepository.findCredentialsByEmail(email);
    const isPasswordValid = await verifyPassword(
      password,
      credentials?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!credentials || !isPasswordValid || isBlockedPassword(password)) {
      return null;
    }

    return this.findById(credentials.id);
  }

  async getByFilter(filter: GetUsersByFilterDto): Promise<ICursorPage<IUser>> {
    const role = filter.role ?? null;
    const roleUserIds =
      role === null ? null : await this.userRoleService.findUserIdsByRole(role);
    const page = await this.userRepository.findByFilter(
      { search: filter.search ?? null },
      toCursorBatch(filter),
      roleUserIds,
    );

    return { ...page, items: await this.addAssignedRoles(page.items) };
  }

  async getRoleCounts(): Promise<TUserRoleCounts> {
    const [roleCounts, total] = await Promise.all([
      Promise.all(
        USER_ROLE_VALUES.map(async (role) => {
          const roleUserIds =
            await this.userRoleService.findUserIdsByRole(role);
          const count = await this.userRepository.countActiveByIds(roleUserIds);

          return { role, count };
        }),
      ),
      this.userRepository.countActiveUsers(),
    ]);

    return {
      ...roleCounts.reduce<TUserRoleCounts>(
        (counts, { role, count }) => ({ ...counts, [role]: count }),
        EMPTY_USER_ROLE_COUNTS,
      ),
      total,
    };
  }

  createForActor(input: CreateUserDto, actor: IAuthorizedUser): Promise<IUser> {
    assertPermissions(
      actor,
      PERMISSIONS.EMPLOYEES_CREATE,
      PERMISSIONS.EMPLOYEES_ROLES_ASSIGN,
    );

    return this.create(input, actor);
  }

  updateForActor(
    id: string,
    input: UpdateUserDto,
    actor: IAuthorizedUser,
  ): Promise<IUser> {
    assertPermissions(actor, PERMISSIONS.EMPLOYEES_UPDATE);

    if ('assignedRoles' in input) {
      assertPermissions(actor, PERMISSIONS.EMPLOYEES_ROLES_ASSIGN);
    }

    return this.update(id, input, actor);
  }

  async create(user: CreateUserDto, actor: IAuthorizedUser): Promise<IUser> {
    return this.createAccount(user, actor);
  }

  async createInitialSystemAdministrator(user: CreateUserDto): Promise<IUser> {
    if (user.assignedRoles[0] !== USER_ROLES.SYSTEM_ADMIN) {
      throw new BadRequestException(
        'The bootstrap account must use the system administrator role',
      );
    }

    return this.createAccount(user, null);
  }

  private async createAccount(
    user: CreateUserDto,
    actor: IAuthorizedUser | null,
  ): Promise<IUser> {
    this.assertAllowedPassword(user.password);
    await this.assertEmailAvailable(user.email);

    const assignedRoles = user.assignedRoles;
    const initialRole = this.firstAssignedRole(assignedRoles);
    this.assertValidAssignments(initialRole, assignedRoles);
    const passwordHash = await hashPassword(user.password);
    const createdId = await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(
        USER_ROLE_LOCK_KEYS.SYSTEM_ADMIN_MEMBERSHIP,
        transaction,
      );
      await this.transactions.markRoleMembershipManaged(transaction);
      const createdUser = await this.userRepository.create(
        {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: initialRole,
          passwordHash,
        },
        transaction,
      );

      await this.userRoleService.create(
        assignedRoles.map((role) => ({ userId: createdUser.id, role })),
        transaction,
      );
      await this.userRoleAuditService.record(
        {
          action: USER_ROLE_AUDIT_ACTIONS.ASSIGNMENT,
          actorId: actor?.id ?? createdUser.id,
          actorRole: actor?.role ?? initialRole,
          subjectUserId: createdUser.id,
          previousRole: null,
          nextRole: initialRole,
          previousAssignedRoles: [],
          nextAssignedRoles: this.orderRoles(assignedRoles),
        },
        transaction,
      );

      return createdUser.id;
    });

    return this.getById(createdId);
  }

  async update(
    id: string,
    changes: UpdateUserDto,
    actor: IAuthorizedUser,
  ): Promise<IUser> {
    const currentUser = await this.getById(id);
    const requestedEmail = changes.email ?? null;
    const isEmailChanging =
      requestedEmail !== null &&
      requestedEmail.toLowerCase() !== currentUser.email.toLowerCase();

    if (isEmailChanging && requestedEmail !== null) {
      await this.assertEmailAvailable(requestedEmail);
    }

    await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(
        USER_ROLE_LOCK_KEYS.SYSTEM_ADMIN_MEMBERSHIP,
        transaction,
      );
      await this.transactions.markRoleMembershipManaged(transaction);
      const user = await this.requireUserInTransaction(id, transaction);
      const currentRoles = user.assignedRoles ?? [user.role];
      const nextRoles = changes.assignedRoles ?? currentRoles;
      const nextRole = nextRoles.includes(user.role)
        ? user.role
        : this.firstAssignedRole(nextRoles);

      this.assertValidAssignments(nextRole, nextRoles);
      await this.assertSystemAdministratorRemains(
        user.id,
        currentRoles,
        nextRoles,
        transaction,
      );

      const attributes: TUserUpdateAttributes = {
        firstName: changes.firstName,
        lastName: changes.lastName,
        email: changes.email,
        phone: changes.phone,
        role: nextRole,
      };
      await this.userRepository.update(id, attributes, transaction);

      if (!hasSameRoles(currentRoles, nextRoles)) {
        await this.userRoleService.replaceForUser(id, nextRoles, transaction);
      }

      const roleChanged =
        user.role !== nextRole || !hasSameRoles(currentRoles, nextRoles);

      if (roleChanged) {
        await this.userRoleAuditService.record(
          {
            action: USER_ROLE_AUDIT_ACTIONS.ASSIGNMENT,
            actorId: actor.id,
            actorRole: actor.role,
            subjectUserId: id,
            previousRole: user.role,
            nextRole,
            previousAssignedRoles: this.orderRoles(currentRoles),
            nextAssignedRoles: this.orderRoles(nextRoles),
          },
          transaction,
        );
      }
    });

    return this.getById(id);
  }

  async switchActiveRole(
    userId: string,
    nextRole: UserRoleType,
    actor: IAuthorizedUser,
  ): Promise<IUser> {
    return this.transactions
      .run(async (transaction) => {
        await this.transactions.lockKey(
          USER_ROLE_LOCK_KEYS.SYSTEM_ADMIN_MEMBERSHIP,
          transaction,
        );
        await this.transactions.markRoleMembershipManaged(transaction);
        const user = await this.requireUserInTransaction(userId, transaction);
        const assignedRoles = user.assignedRoles ?? [user.role];
        this.assertActiveRoleAssigned(nextRole, assignedRoles);

        if (user.role === nextRole) {
          return user;
        }

        await this.userRepository.update(
          userId,
          { role: nextRole },
          transaction,
        );
        await this.userRoleAuditService.record(
          {
            action: USER_ROLE_AUDIT_ACTIONS.SWITCH,
            actorId: actor.id,
            actorRole: actor.role,
            subjectUserId: userId,
            previousRole: user.role,
            nextRole,
            previousAssignedRoles: this.orderRoles(assignedRoles),
            nextAssignedRoles: this.orderRoles(assignedRoles),
          },
          transaction,
        );

        return { ...user, role: nextRole };
      })
      .then(async () => this.getById(userId));
  }

  async updatePassword(
    userId: string,
    changes: UpdateUserPasswordDto,
  ): Promise<void> {
    this.assertAllowedPassword(changes.password);
    await this.transactions.run(async (transaction) => {
      const credentials = await this.userRepository.findCredentialsById(
        userId,
        transaction,
      );
      if (!credentials) {
        throw new NotFoundException(`User ${userId} was not found`);
      }

      const valid = await verifyPassword(
        changes.currentPassword,
        credentials.passwordHash,
      );
      if (!valid) {
        throw new BadRequestException({
          code: HTTP_ERROR_CODES.INVALID_CURRENT_PASSWORD,
          message: 'Current password is incorrect',
        });
      }

      if (await verifyPassword(changes.password, credentials.passwordHash)) {
        throw new BadRequestException(
          'New password must differ from the current password',
        );
      }

      const passwordHash = await hashPassword(changes.password);
      await this.userRepository.updatePasswordHash(
        userId,
        passwordHash,
        transaction,
      );
    });
  }

  private assertAllowedPassword(password: string): void {
    if (isBlockedPassword(password)) {
      throw new BadRequestException('Choose a different password');
    }
  }

  async delete(id: string, requester: IAuthorizedUser): Promise<void> {
    if (id === requester.id) {
      throw new BadRequestException('You cannot delete your own user');
    }

    await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(
        USER_ROLE_LOCK_KEYS.SYSTEM_ADMIN_MEMBERSHIP,
        transaction,
      );
      const user = await this.requireUserInTransaction(id, transaction);
      const assignedRoles = user.assignedRoles ?? [user.role];
      await this.assertSystemAdministratorRemains(
        user.id,
        assignedRoles,
        [],
        transaction,
      );
      const isDeleted = await this.userRepository.softDelete(id, transaction);

      if (!isDeleted) {
        throw new NotFoundException(`User ${id} was not found`);
      }

      await this.userRoleAuditService.record(
        {
          action: USER_ROLE_AUDIT_ACTIONS.ASSIGNMENT,
          actorId: requester.id,
          actorRole: requester.role,
          subjectUserId: id,
          previousRole: user.role,
          nextRole: null,
          previousAssignedRoles: this.orderRoles(assignedRoles),
          nextAssignedRoles: [],
        },
        transaction,
      );
    });
  }

  private async requireUserInTransaction(
    id: string,
    transaction: Transaction,
  ): Promise<IUser> {
    const user = await this.userRepository.findById(id, transaction);

    if (!user) {
      throw new NotFoundException(`User ${id} was not found`);
    }

    const [assignedUser] = await this.addAssignedRoles([user], transaction);

    if (!assignedUser) {
      throw new NotFoundException(`User ${id} was not found`);
    }

    return assignedUser;
  }

  private async addAssignedRoles(
    users: User[],
    transaction?: Transaction,
  ): Promise<IUser[]> {
    const rolesByUserId = await this.userRoleService.getAssignedRolesByUserIds(
      users.map(({ id }) => id),
      transaction,
    );

    return users.map((user) => {
      const assignedRoles = this.orderRoles(rolesByUserId.get(user.id) ?? []);
      const userData = user instanceof User ? user.get({ plain: true }) : user;

      return { ...userData, assignedRoles };
    });
  }

  private async assertSystemAdministratorRemains(
    userId: string,
    currentRoles: UserRoleType[],
    nextRoles: UserRoleType[],
    transaction: Transaction,
  ): Promise<void> {
    const removesSystemAdministrator =
      currentRoles.includes(USER_ROLES.SYSTEM_ADMIN) &&
      !nextRoles.includes(USER_ROLES.SYSTEM_ADMIN);

    if (!removesSystemAdministrator) {
      return;
    }

    const administratorIds = await this.userRoleService.findUserIdsByRole(
      USER_ROLES.SYSTEM_ADMIN,
      transaction,
    );
    const remainingAdministratorIds = administratorIds.filter(
      (administratorId) => administratorId !== userId,
    );
    const administratorCount = await this.userRepository.countActiveByIds(
      remainingAdministratorIds,
      transaction,
    );

    if (administratorCount === 0) {
      throw new ConflictException(
        'At least one active system administrator must remain',
      );
    }
  }

  private assertValidAssignments(
    activeRole: UserRoleType,
    assignedRoles: UserRoleType[],
  ): void {
    const hasUniqueRoles = new Set(assignedRoles).size === assignedRoles.length;
    const hasOnlyKnownRoles = assignedRoles.every((role) =>
      USER_ROLE_VALUES.includes(role),
    );

    if (assignedRoles.length === 0 || !hasUniqueRoles || !hasOnlyKnownRoles) {
      throw new BadRequestException(
        'Each employee must have at least one unique assigned role',
      );
    }

    this.assertActiveRoleAssigned(activeRole, assignedRoles);
  }

  private assertActiveRoleAssigned(
    activeRole: UserRoleType,
    assignedRoles: UserRoleType[],
  ): void {
    if (!assignedRoles.includes(activeRole)) {
      throw new BadRequestException(
        'The active role must be one of the assigned roles',
      );
    }
  }

  private firstAssignedRole(assignedRoles: UserRoleType[]): UserRoleType {
    const firstRole = assignedRoles[0];

    if (!firstRole) {
      throw new BadRequestException(
        'Each employee must have at least one assigned role',
      );
    }

    return firstRole;
  }

  private orderRoles(roles: UserRoleType[]): UserRoleType[] {
    return USER_ROLE_VALUES.filter((role) => roles.includes(role));
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existingUser =
      await this.userRepository.findByEmailIncludingDeleted(email);

    if (existingUser) {
      throw new ConflictException(`The email ${email} is already in use`);
    }
  }
}
