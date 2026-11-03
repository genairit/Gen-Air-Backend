import {
  USER_ROLES,
  UserRoleType,
  USER_ROLE_VALUES,
} from '@Constants/user-role.constant';

import {
  IUser,
  TUserUpdateAttributes,
  TUserCreationAttributes,
} from '@Modules/user/interfaces/user.interface';

import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Test } from '@nestjs/testing';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { Sequelize } from 'sequelize-typescript';
import { TIME_UNITS } from '@Constants/time.constant';
import { AuthService } from '@Modules/auth/auth.service';
import { UserService } from '@Modules/user/user.service';
import { PGlite, Transaction } from '@electric-sql/pglite';
import { UserRepository } from '@Modules/user/user.repository';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { CreateUserDto } from '@Modules/user/dto/create-user.dto';
import { authorizedUser } from '../../testing/authorization.fixture';
import { UserRoleService } from '@Modules/user-role/user-role.service';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { QueryTypes, Transaction as SequelizeTransaction } from 'sequelize';
import { UserRoleAuditService } from '@Modules/user-role-audit/user-role-audit.service';
import { RolePermissionService } from '@Modules/role-permission/role-permission.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { TUserRoleAuditCreationAttributes } from '@Modules/user-role-audit/interfaces/user-role-audit.interface';

const LEGACY_ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const COMPATIBILITY_USER_ID = '00000000-0000-4000-8000-000000000002';
const ROLLBACK_USER_ID = '00000000-0000-4000-8000-000000000003';
const MULTI_ROLE_USER_ID = '00000000-0000-4000-8000-000000000004';
const SECOND_ADMIN_ID = '00000000-0000-4000-8000-000000000005';
const LEGACY_TRANSITION_ID = '00000000-0000-4000-8000-000000000006';
const LEGACY_UPDATE_USER_ID = '00000000-0000-4000-8000-000000000007';
const EXCLUDED_DATABASE_PORTS = [3100, 5180, 54329, 4100];
const CONCURRENCY_ACTOR_ID = COMPATIBILITY_USER_ID;
const ROLE_MIGRATION_TEST_TIMINGS = {
  LOCK_POLL_MS: TIME_UNITS.SECOND_MS / 40,
  TEST_TIMEOUT_MS: 30 * TIME_UNITS.SECOND_MS,
} as const;

interface ITransactionGate {
  signalFirstRead: () => void;
  releaseFirstRead: () => void;
  holderBackendPid: number | null;
}

interface IRealDatabaseHandle {
  databaseDir: string;
  sequelize: Sequelize;
}

const POSTGRES_BINARIES = {
  CONTROL: 'pg_ctl',
  INITIALIZE: 'initdb',
} as const;
const executeFile = promisify(execFile);

const databaseState: { database: PGlite | null } = { database: null };

const getDatabase = (): PGlite => {
  const database = databaseState.database;

  if (!database) {
    throw new Error('The role migration database is unavailable');
  }

  return database;
};

const createMigratedDatabase = async (): Promise<PGlite> => {
  const database = new PGlite();
  const roleValues = USER_ROLE_VALUES.map((role) => `'${role}'`).join(', ');
  const beforeDeploy = await readFile(
    resolve(process.cwd(), 'migrations/sprint-almon/before_deploy.sql'),
    'utf8',
  );
  const afterDeploy = await readFile(
    resolve(process.cwd(), 'migrations/sprint-almon/after_deploy.sql'),
    'utf8',
  );

  await database.exec(`
    CREATE TYPE user_role AS ENUM (${roleValues});
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      role user_role NOT NULL,
      deleted_at timestamptz,
      email text
    );
    CREATE TABLE task_status_transitions (
      id uuid PRIMARY KEY,
      changed_by_id uuid NOT NULL
    );
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    INSERT INTO users (id, role)
    VALUES
      ('${LEGACY_ADMIN_ID}', '${USER_ROLES.SYSTEM_ADMIN}'),
      ('${LEGACY_UPDATE_USER_ID}', '${USER_ROLES.ENGINEER}');
  `);
  await database.exec(beforeDeploy);
  await database.exec(`
    UPDATE users
    SET role = '${USER_ROLES.SECRETARY}'
    WHERE id = '${LEGACY_UPDATE_USER_ID}';
    INSERT INTO users (id, role)
    VALUES ('${COMPATIBILITY_USER_ID}', '${USER_ROLES.ENGINEER}');
    INSERT INTO task_status_transitions (id, changed_by_id)
    VALUES ('${LEGACY_TRANSITION_ID}', '${LEGACY_ADMIN_ID}');
    COMMIT;
  `);
  await database.exec(afterDeploy);
  await database.exec('COMMIT;');

  return database;
};

const countRows = async (
  database: PGlite | Transaction,
  query: string,
  parameters: string[] = [],
): Promise<number> => {
  const result = await database.query<{ count: string }>(query, parameters);
  const row = result.rows[0];

  if (!row) {
    throw new Error('The database count query returned no result');
  }

  return Number(row.count);
};

const findAvailableDatabasePort = async (attempt = 0): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Could not reserve an available database port');
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  if (!EXCLUDED_DATABASE_PORTS.includes(address.port)) {
    return address.port;
  }

  if (attempt > 10) {
    throw new Error('Could not find a database port outside QA reservations');
  }

  return findAvailableDatabasePort(attempt + 1);
};

const waitForAdvisoryLockWaiters = async (
  sequelize: Sequelize,
  remainingAttempts: number,
): Promise<{ pid: number }[]> => {
  const waiters = await sequelize.query<{ pid: number }>(
    `SELECT pid
     FROM pg_stat_activity
     WHERE wait_event_type = 'Lock'
       AND query LIKE '%pg_advisory_xact_lock%'`,
    { type: QueryTypes.SELECT },
  );

  if (waiters.length > 0) {
    return waiters;
  }

  if (remainingAttempts === 0) {
    throw new Error('No PostgreSQL connection waited on the advisory lock');
  }

  await new Promise<void>((resolve) =>
    setTimeout(resolve, ROLE_MIGRATION_TEST_TIMINGS.LOCK_POLL_MS),
  );

  return waitForAdvisoryLockWaiters(sequelize, remainingAttempts - 1);
};

const startRealPostgres = async (): Promise<IRealDatabaseHandle> => {
  const port = await findAvailableDatabasePort();
  const databaseDir = resolve(
    process.cwd(),
    `.role-concurrency-postgres-${randomUUID()}`,
  );
  const postgresBinaryDirectory = resolve(
    process.cwd(),
    'node_modules',
    '@embedded-postgres',
    `${process.platform}-${process.arch}`,
    'native',
    'bin',
  );
  const postgresControl = resolve(
    postgresBinaryDirectory,
    POSTGRES_BINARIES.CONTROL,
  );
  const postgresInitializer = resolve(
    postgresBinaryDirectory,
    POSTGRES_BINARIES.INITIALIZE,
  );
  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: '127.0.0.1',
    port,
    username: 'postgres',
    password: '',
    database: 'postgres',
    logging: false,
    pool: { max: 5, min: 0 },
  });
  const postgresState = { isStarted: false };

  try {
    await executeFile(postgresInitializer, [
      '-D',
      databaseDir,
      '-U',
      'postgres',
      '--auth=trust',
    ]);
    await executeFile(postgresControl, [
      '-D',
      databaseDir,
      '-o',
      `-h 127.0.0.1 -p ${port} -c listen_addresses=127.0.0.1`,
      '-l',
      resolve(databaseDir, 'postgres.log'),
      '-w',
      'start',
    ]);
    postgresState.isStarted = true;
    await sequelize.authenticate();
    await sequelize.query(`
      CREATE TYPE user_role AS ENUM (${USER_ROLE_VALUES.map((role) => `'${role}'`).join(', ')});
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        first_name text NOT NULL,
        last_name text NOT NULL,
        email text NOT NULL,
        phone text NOT NULL,
        employee_number text NOT NULL,
        role user_role NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      );
      CREATE TABLE user_roles (
        user_id uuid NOT NULL REFERENCES users(id),
        role user_role NOT NULL,
        PRIMARY KEY (user_id, role)
      );
      CREATE TABLE user_role_audits (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id uuid NOT NULL REFERENCES users(id),
        actor_role user_role NOT NULL,
        subject_user_id uuid NOT NULL REFERENCES users(id),
        action varchar(20) NOT NULL,
        previous_role user_role,
        next_role user_role,
        previous_assigned_roles jsonb NOT NULL,
        next_assigned_roles jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO users (id, first_name, last_name, email, phone, employee_number, role)
      VALUES
        ('${LEGACY_ADMIN_ID}', 'First', 'Admin', 'first-admin@test.invalid', '0500000001', 'A-1', '${USER_ROLES.SYSTEM_ADMIN}'),
        ('${SECOND_ADMIN_ID}', 'Second', 'Admin', 'second-admin@test.invalid', '0500000002', 'A-2', '${USER_ROLES.SYSTEM_ADMIN}'),
        ('${CONCURRENCY_ACTOR_ID}', 'Test', 'Actor', 'actor@test.invalid', '0500000003', 'E-1', '${USER_ROLES.ENGINEER}');
      INSERT INTO user_roles (user_id, role)
      VALUES
        ('${LEGACY_ADMIN_ID}', '${USER_ROLES.SYSTEM_ADMIN}'),
        ('${SECOND_ADMIN_ID}', '${USER_ROLES.SYSTEM_ADMIN}'),
        ('${CONCURRENCY_ACTOR_ID}', '${USER_ROLES.ENGINEER}');
    `);

    return { databaseDir, sequelize };
  } catch (error) {
    await sequelize.close();
    if (postgresState.isStarted) {
      await executeFile(postgresControl, [
        '-D',
        databaseDir,
        '-m',
        'fast',
        '-w',
        'stop',
      ]);
    }

    await rm(databaseDir, { recursive: true, force: true });
    throw error;
  }
};

const stopRealPostgres = async (databaseDir: string): Promise<void> => {
  const postgresControl = resolve(
    process.cwd(),
    'node_modules',
    '@embedded-postgres',
    `${process.platform}-${process.arch}`,
    'native',
    'bin',
    POSTGRES_BINARIES.CONTROL,
  );

  await executeFile(postgresControl, [
    '-D',
    databaseDir,
    '-m',
    'fast',
    '-w',
    'stop',
  ]);
  await rm(databaseDir, { recursive: true, force: true });
};

const createTransactionGate = (): {
  blockedFirstRead: Promise<void>;
  firstReadStarted: Promise<void>;
  gate: ITransactionGate;
} => {
  const gate: ITransactionGate = {
    holderBackendPid: null,
    releaseFirstRead: () => {},
    signalFirstRead: () => {},
  };
  const firstReadStarted = new Promise<void>((resolve) => {
    gate.signalFirstRead = resolve;
  });
  const blockedFirstRead = new Promise<void>((resolve) => {
    gate.releaseFirstRead = resolve;
  });

  return { blockedFirstRead, firstReadStarted, gate };
};

const createPostgresBackedUserService = async (
  sequelize: Sequelize,
  gate: ITransactionGate,
  blockedFirstRead: Promise<void>,
): Promise<UserService> => {
  const findById = async (
    userId: string,
    transaction?: SequelizeTransaction,
  ): Promise<IUser | null> => {
    const users = await sequelize.query<IUser & { backendPid: number }>(
      `SELECT
         id, email, phone, role, first_name AS "firstName",
         last_name AS "lastName", employee_number AS "employeeNumber",
         created_at AS "createdAt", updated_at AS "updatedAt",
         deleted_at AS "deletedAt", pg_backend_pid() AS "backendPid"
       FROM users
       WHERE id = :userId AND deleted_at IS NULL`,
      {
        type: QueryTypes.SELECT,
        replacements: { userId },
        transaction,
      },
    );
    const user = users[0] ?? null;

    if (!user) {
      return null;
    }

    if (transaction && gate.holderBackendPid === null) {
      gate.holderBackendPid = user.backendPid;
      gate.signalFirstRead();
      await blockedFirstRead;
    }

    return user;
  };
  const userRepository = {
    findById,
    countActiveByIds: async (
      userIds: string[],
      transaction?: SequelizeTransaction,
    ): Promise<number> => {
      if (userIds.length === 0) {
        return 0;
      }

      const rows = await sequelize.query<{ count: number }>(
        `SELECT COUNT(*)::integer AS count
         FROM users
         WHERE id IN (:userIds) AND deleted_at IS NULL`,
        {
          type: QueryTypes.SELECT,
          replacements: { userIds },
          transaction,
        },
      );

      return rows[0]?.count ?? 0;
    },
    softDelete: async (
      userId: string,
      transaction?: SequelizeTransaction,
    ): Promise<boolean> => {
      await sequelize.query(
        'UPDATE users SET deleted_at = now() WHERE id = :userId',
        { replacements: { userId }, transaction },
      );

      return true;
    },
  };
  const userRoleService = {
    getAssignedRolesByUserIds: async (
      userIds: string[],
      transaction?: SequelizeTransaction,
    ): Promise<Map<string, UserRoleType[]>> => {
      if (userIds.length === 0) {
        return new Map();
      }

      const assignments = await sequelize.query<{
        userId: string;
        role: UserRoleType;
      }>(
        `SELECT user_id AS "userId", role
         FROM user_roles
         WHERE user_id IN (:userIds)`,
        {
          type: QueryTypes.SELECT,
          replacements: { userIds },
          transaction,
        },
      );

      return new Map(
        userIds.map((userId) => [
          userId,
          assignments
            .filter((assignment) => assignment.userId === userId)
            .map((assignment) => assignment.role),
        ]),
      );
    },
    findUserIdsByRole: async (
      role: UserRoleType,
      transaction?: SequelizeTransaction,
    ): Promise<string[]> => {
      const members = await sequelize.query<{ userId: string }>(
        'SELECT user_id AS "userId" FROM user_roles WHERE role = :role',
        {
          type: QueryTypes.SELECT,
          replacements: { role },
          transaction,
        },
      );

      return members.map(({ userId }) => userId);
    },
  };
  const userRoleAuditService = {
    record: async (
      attributes: TUserRoleAuditCreationAttributes,
      transaction: SequelizeTransaction,
    ): Promise<void> => {
      await sequelize.query(
        `INSERT INTO user_role_audits (
           actor_id, actor_role, subject_user_id, action, previous_role,
           next_role, previous_assigned_roles, next_assigned_roles
         )
         VALUES (
           :actorId, :actorRole, :subjectUserId, :action, :previousRole,
           :nextRole, :previousAssignedRoles, :nextAssignedRoles
         )`,
        {
          replacements: {
            ...attributes,
            previousAssignedRoles: JSON.stringify(
              attributes.previousAssignedRoles,
            ),
            nextAssignedRoles: JSON.stringify(attributes.nextAssignedRoles),
          },
          transaction,
        },
      );
    },
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      UserService,
      { provide: UserRepository, useValue: userRepository },
      { provide: UserRoleService, useValue: userRoleService },
      { provide: UserRoleAuditService, useValue: userRoleAuditService },
      {
        provide: DatabaseTransactionService,
        useValue: new DatabaseTransactionService(sequelize),
      },
    ],
  }).compile();

  return moduleRef.get(UserService);
};

const createUserService = async (
  database: PGlite,
): Promise<{
  service: UserService;
  auditState: { failNextAudit: boolean };
}> => {
  const auditState = { failNextAudit: false };
  const findById = async (
    userId: string,
    transaction?: Transaction,
  ): Promise<IUser | null> => {
    const executor = transaction ?? database;
    const result = await executor.query<{
      id: string;
      role: UserRoleType;
      deleted_at: string | null;
      email: string | null;
    }>(
      'SELECT id, role, deleted_at, email FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId],
    );
    const user = result.rows[0];

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      role: user.role,
      deletedAt: null,
      email: user.email ?? `${user.id}@test.invalid`,
      phone: '0500000000',
      firstName: 'Test',
      lastName: 'Administrator',
      employeeNumber: user.id,
      createdAt: new Date('2026-10-25T00:00:00.000Z'),
      updatedAt: new Date('2026-10-25T00:00:00.000Z'),
    };
  };
  const userRepository = {
    findById,
    findByEmailIncludingDeleted: async (
      email: string,
    ): Promise<IUser | null> => {
      const result = await database.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [email],
      );
      const user = result.rows[0];

      return user ? findById(user.id) : null;
    },
    create: async (
      attributes: TUserCreationAttributes,
      transaction?: Transaction,
    ): Promise<IUser> => {
      const executor = transaction ?? database;
      await executor.query(
        'INSERT INTO users (id, role, email) VALUES ($1, $2, $3)',
        [ROLLBACK_USER_ID, attributes.role, attributes.email],
      );
      const createdUser = await findById(ROLLBACK_USER_ID, transaction);

      if (!createdUser) {
        throw new Error('The created account was not persisted');
      }

      return createdUser;
    },
    update: async (
      userId: string,
      attributes: TUserUpdateAttributes,
      transaction?: Transaction,
    ): Promise<boolean> => {
      const executor = transaction ?? database;
      const result = await executor.query(
        'UPDATE users SET role = $1 WHERE id = $2',
        [attributes.role, userId],
      );

      return (result.affectedRows ?? 0) > 0;
    },
    countActiveByIds: async (
      userIds: string[],
      transaction?: Transaction,
    ): Promise<number> => {
      const executor = transaction ?? database;
      const result = await executor.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM users
         WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [userIds],
      );

      return Number(result.rows[0]?.count ?? '0');
    },
    softDelete: async (
      userId: string,
      transaction?: Transaction,
    ): Promise<boolean> => {
      const executor = transaction ?? database;
      const result = await executor.query(
        'UPDATE users SET deleted_at = now() WHERE id = $1',
        [userId],
      );

      return (result.affectedRows ?? 0) > 0;
    },
  };
  const userRoleService = {
    create: async (
      assignments: { userId: string; role: UserRoleType }[],
      transaction: Transaction,
    ): Promise<void> => {
      await Promise.all(
        assignments.map(({ userId, role }) =>
          transaction.query(
            'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
            [userId, role],
          ),
        ),
      );
    },
    getAssignedRolesByUserIds: async (
      userIds: string[],
      transaction?: Transaction,
    ): Promise<Map<string, UserRoleType[]>> => {
      const executor = transaction ?? database;
      const result = await executor.query<{
        user_id: string;
        role: UserRoleType;
      }>(
        'SELECT user_id, role FROM user_roles WHERE user_id = ANY($1::uuid[])',
        [userIds],
      );

      return new Map(
        userIds.map((userId) => [
          userId,
          result.rows
            .filter((assignment) => assignment.user_id === userId)
            .map((assignment) => assignment.role),
        ]),
      );
    },
    findUserIdsByRole: async (
      role: UserRoleType,
      transaction?: Transaction,
    ): Promise<string[]> => {
      const executor = transaction ?? database;
      const result = await executor.query<{ user_id: string }>(
        'SELECT user_id FROM user_roles WHERE role = $1',
        [role],
      );

      return result.rows.map(({ user_id }) => user_id);
    },
  };
  const userRoleAuditService = {
    record: async (
      attributes: TUserRoleAuditCreationAttributes,
      transaction: Transaction,
    ): Promise<void> => {
      await transaction.query(
        `INSERT INTO user_role_audits (
           actor_id, actor_role, subject_user_id, action, previous_role,
           next_role, previous_assigned_roles, next_assigned_roles
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [
          attributes.actorId,
          attributes.actorRole,
          attributes.subjectUserId,
          attributes.action,
          attributes.previousRole,
          attributes.nextRole,
          JSON.stringify(attributes.previousAssignedRoles),
          JSON.stringify(attributes.nextAssignedRoles),
        ],
      );

      if (auditState.failNextAudit) {
        auditState.failNextAudit = false;
        throw new Error('Configured audit failure');
      }
    },
  };
  const transactions = {
    run: (work: (transaction: Transaction) => Promise<unknown>) =>
      database.transaction(work),
    lockKey: async (key: string, transaction: Transaction): Promise<void> => {
      await transaction.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [key],
      );
    },
    markRoleMembershipManaged: async (
      transaction: Transaction,
    ): Promise<void> => {
      await transaction.query(
        "SELECT set_config('genair.role_membership_managed', 'true', true)",
      );
    },
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

  return { service: moduleRef.get(UserService), auditState };
};

describe('role assignment migrations', () => {
  beforeEach(async () => {
    databaseState.database = await createMigratedDatabase();
  });

  afterEach(async () => {
    const database = databaseState.database;
    databaseState.database = null;
    await database?.close();
  });

  it('keeps old-backend writes compatible and protects role tables from API roles', async () => {
    const database = getDatabase();
    const activeRoleBackfills = await countRows(
      database,
      `SELECT COUNT(*)::text AS count
       FROM users
       JOIN user_roles ON user_roles.user_id = users.id
       WHERE user_roles.role = users.role`,
    );
    const legacyRoleSnapshotCount = await countRows(
      database,
      `SELECT COUNT(*)::text AS count
       FROM task_status_transitions
       WHERE changed_by_role IS NOT NULL`,
    );
    const protectedTableCount = await countRows(
      database,
      `SELECT COUNT(*)::text AS count
       FROM pg_class
       WHERE relname IN ('user_roles', 'user_role_audits')
         AND relrowsecurity`,
    );
    const anonPrivileges = await countRows(
      database,
      `SELECT COUNT(*)::text AS count
       FROM (
         SELECT has_table_privilege('anon', 'user_roles', 'SELECT') AS allowed
         UNION ALL
         SELECT has_table_privilege('anon', 'user_role_audits', 'INSERT')
         UNION ALL
         SELECT has_table_privilege('authenticated', 'user_roles', 'INSERT')
         UNION ALL
         SELECT has_table_privilege('authenticated', 'user_role_audits', 'UPDATE')
       ) AS api_privileges
       WHERE allowed`,
    );
    const publicPrivileges = await countRows(
      database,
      `SELECT COUNT(*)::text AS count
       FROM pg_class
       CROSS JOIN LATERAL aclexplode(relacl) AS privileges
       WHERE relname IN ('user_roles', 'user_role_audits')
         AND privileges.grantee = 0`,
    );

    expect(activeRoleBackfills).toBe(3);
    expect(legacyRoleSnapshotCount).toBe(0);
    expect(protectedTableCount).toBe(2);
    expect(anonPrivileges).toBe(0);
    expect(publicPrivileges).toBe(0);

    const oldUpdatedMemberships = await database.query<{
      role: UserRoleType;
    }>('SELECT role FROM user_roles WHERE user_id = $1', [
      LEGACY_UPDATE_USER_ID,
    ]);
    const oldCreatedMemberships = await database.query<{
      role: UserRoleType;
    }>('SELECT role FROM user_roles WHERE user_id = $1', [
      COMPATIBILITY_USER_ID,
    ]);

    expect(oldUpdatedMemberships.rows).toEqual([
      { role: USER_ROLES.SECRETARY },
    ]);
    expect(oldCreatedMemberships.rows).toEqual([{ role: USER_ROLES.ENGINEER }]);

    const { service } = await createUserService(database);
    const authModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn().mockResolvedValue({
              sub: LEGACY_UPDATE_USER_ID,
            }),
          },
        },
        { provide: UserService, useValue: service },
        {
          provide: RolePermissionService,
          useValue: { getPermissions: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();
    const authentication = authModule.get(AuthService);
    const currentUser = await authentication.authenticate('legacy-session');

    expect(currentUser).toMatchObject({
      role: USER_ROLES.SECRETARY,
      assignedRoles: [USER_ROLES.SECRETARY],
    });
    await expect(
      authentication.switchActiveRole(currentUser, USER_ROLES.ENGINEER),
    ).rejects.toThrow('The active role must be one of the assigned roles');

    await expect(
      database.transaction(async (transaction) => {
        await transaction.query(
          `DELETE FROM user_roles
           WHERE user_id = $1 AND role = $2`,
          [COMPATIBILITY_USER_ID, USER_ROLES.ENGINEER],
        );
      }),
    ).rejects.toThrow('Every active user must have their active role assigned');
  });

  it('preserves application-managed multi-role assignments when changing active role', async () => {
    const database = getDatabase();

    await database.transaction(async (transaction) => {
      await transaction.query(
        "SELECT set_config('genair.role_membership_managed', 'true', true)",
      );
      await transaction.query('INSERT INTO users (id, role) VALUES ($1, $2)', [
        MULTI_ROLE_USER_ID,
        USER_ROLES.ENGINEER,
      ]);
      await transaction.query(
        `INSERT INTO user_roles (user_id, role)
         VALUES ($1, $2), ($1, $3)`,
        [MULTI_ROLE_USER_ID, USER_ROLES.ENGINEER, USER_ROLES.SECRETARY],
      );
      await transaction.query('UPDATE users SET role = $1 WHERE id = $2', [
        USER_ROLES.SECRETARY,
        MULTI_ROLE_USER_ID,
      ]);
    });

    const assignedRoles = await database.query<{ role: UserRoleType }>(
      'SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role',
      [MULTI_ROLE_USER_ID],
    );

    expect(assignedRoles.rows).toEqual([
      { role: USER_ROLES.ENGINEER },
      { role: USER_ROLES.SECRETARY },
    ]);
  });

  it('rolls back account, assignment, and audit writes together and repairs legacy memberships', async () => {
    const database = getDatabase();
    const oldBackendMemberships = await countRows(
      database,
      `SELECT COUNT(*)::text AS count
       FROM user_roles
       WHERE user_id = $1 AND role = $2`,
      [COMPATIBILITY_USER_ID, USER_ROLES.ENGINEER],
    );
    const { service, auditState } = await createUserService(database);
    const actor: IAuthorizedUser = {
      ...authorizedUser([
        PERMISSIONS.EMPLOYEES_CREATE,
        PERMISSIONS.EMPLOYEES_ROLES_ASSIGN,
      ]),
      id: LEGACY_ADMIN_ID,
    };
    const input: CreateUserDto = {
      firstName: 'New',
      lastName: 'Engineer',
      email: 'new-engineer@test.invalid',
      phone: '0500000000',
      assignedRoles: [USER_ROLES.ENGINEER],
      password: 'secure-password-for-tests',
    };
    auditState.failNextAudit = true;

    await expect(service.createForActor(input, actor)).rejects.toThrow(
      'Configured audit failure',
    );
    const rolledBackAccountCount = await countRows(
      database,
      'SELECT COUNT(*)::text AS count FROM users WHERE id = $1',
      [ROLLBACK_USER_ID],
    );
    const rolledBackAssignmentCount = await countRows(
      database,
      'SELECT COUNT(*)::text AS count FROM user_roles WHERE user_id = $1',
      [ROLLBACK_USER_ID],
    );
    const rolledBackAuditCount = await countRows(
      database,
      'SELECT COUNT(*)::text AS count FROM user_role_audits WHERE subject_user_id = $1',
      [ROLLBACK_USER_ID],
    );

    expect(oldBackendMemberships).toBe(1);
    expect(rolledBackAccountCount).toBe(0);
    expect(rolledBackAssignmentCount).toBe(0);
    expect(rolledBackAuditCount).toBe(0);

    const createdUser = await service.createForActor(input, actor);

    expect(createdUser).toMatchObject({
      id: ROLLBACK_USER_ID,
      assignedRoles: [USER_ROLES.ENGINEER],
      role: USER_ROLES.ENGINEER,
    });
    const auditRows = await database.query<{
      actor_role: UserRoleType;
      previous_assigned_roles: UserRoleType[];
      next_assigned_roles: UserRoleType[];
    }>(
      `SELECT actor_role, previous_assigned_roles, next_assigned_roles
       FROM user_role_audits
       WHERE subject_user_id = $1`,
      [ROLLBACK_USER_ID],
    );

    expect(auditRows.rows).toEqual([
      {
        actor_role: USER_ROLES.SYSTEM_ADMIN,
        previous_assigned_roles: [],
        next_assigned_roles: [USER_ROLES.ENGINEER],
      },
    ]);
  });

  it('rejects restoring a revoked active role while preserving the fallback role', async () => {
    const database = getDatabase();
    await database.transaction(async (transaction) => {
      await transaction.query(
        "SELECT set_config('genair.role_membership_managed', 'true', true)",
      );
      await transaction.query('INSERT INTO users (id, role) VALUES ($1, $2)', [
        MULTI_ROLE_USER_ID,
        USER_ROLES.ENGINEER,
      ]);
      await transaction.query(
        `INSERT INTO user_roles (user_id, role)
         VALUES ($1, $2), ($1, $3)`,
        [MULTI_ROLE_USER_ID, USER_ROLES.ENGINEER, USER_ROLES.SECRETARY],
      );
      await transaction.query('UPDATE users SET role = $1 WHERE id = $2', [
        USER_ROLES.SECRETARY,
        MULTI_ROLE_USER_ID,
      ]);
      await transaction.query(
        'DELETE FROM user_roles WHERE user_id = $1 AND role = $2',
        [MULTI_ROLE_USER_ID, USER_ROLES.ENGINEER],
      );
    });

    const { service } = await createUserService(database);
    const actor: IAuthorizedUser = {
      ...authorizedUser(),
      id: COMPATIBILITY_USER_ID,
    };

    await expect(
      service.switchActiveRole(MULTI_ROLE_USER_ID, USER_ROLES.ENGINEER, actor),
    ).rejects.toThrow('The active role must be one of the assigned roles');

    await expect(
      database.transaction(async (transaction) => {
        await transaction.query(
          "SELECT set_config('genair.role_membership_managed', 'true', true)",
        );
        await transaction.query('UPDATE users SET role = $1 WHERE id = $2', [
          USER_ROLES.ENGINEER,
          MULTI_ROLE_USER_ID,
        ]);
      }),
    ).rejects.toThrow('Every active user must have their active role assigned');

    const currentActiveRole = await database.query<{ role: UserRoleType }>(
      'SELECT role FROM users WHERE id = $1',
      [MULTI_ROLE_USER_ID],
    );

    expect(currentActiveRole.rows[0]?.role).toBe(USER_ROLES.SECRETARY);
  });

  it(
    'serializes competing last-administrator deletions across PostgreSQL connections',
    async () => {
      const { databaseDir, sequelize } = await startRealPostgres();
      const { blockedFirstRead, firstReadStarted, gate } =
        createTransactionGate();

      try {
        const service = await createPostgresBackedUserService(
          sequelize,
          gate,
          blockedFirstRead,
        );
        const requester: IAuthorizedUser = {
          ...authorizedUser(),
          id: CONCURRENCY_ACTOR_ID,
          role: USER_ROLES.ENGINEER,
          assignedRoles: [USER_ROLES.ENGINEER],
        };
        const firstRemoval = service.delete(LEGACY_ADMIN_ID, requester);
        await firstReadStarted;
        const secondRemoval = service.delete(SECOND_ADMIN_ID, requester);
        const removalResults = Promise.allSettled([
          firstRemoval,
          secondRemoval,
        ]);
        const lockWaiters = await waitForAdvisoryLockWaiters(sequelize, 80);

        expect(gate.holderBackendPid).not.toBeNull();
        expect(lockWaiters).toHaveLength(1);
        expect(lockWaiters[0]?.pid).not.toBe(gate.holderBackendPid);

        gate.releaseFirstRead();
        const settledRemovals = await removalResults;
        const successfulRemovals = settledRemovals.filter(
          (result) => result.status === 'fulfilled',
        );
        const rejectedRemovals = settledRemovals.filter(
          (result) => result.status === 'rejected',
        );
        const remainingAdministrators = await sequelize.query<{
          count: number;
        }>(
          `SELECT COUNT(*)::integer AS count
         FROM users
         JOIN user_roles ON user_roles.user_id = users.id
         WHERE users.deleted_at IS NULL
           AND user_roles.role = :role`,
          {
            type: QueryTypes.SELECT,
            replacements: { role: USER_ROLES.SYSTEM_ADMIN },
          },
        );
        const auditRows = await sequelize.query<{ count: number }>(
          'SELECT COUNT(*)::integer AS count FROM user_role_audits',
          { type: QueryTypes.SELECT },
        );

        expect(successfulRemovals).toHaveLength(1);
        expect(rejectedRemovals).toHaveLength(1);
        expect(rejectedRemovals[0]?.reason).toMatchObject({
          message: 'At least one active system administrator must remain',
        });
        expect(remainingAdministrators[0]?.count).toBe(1);
        expect(auditRows[0]?.count).toBe(1);
      } finally {
        gate.releaseFirstRead();
        await sequelize.close();
        await stopRealPostgres(databaseDir);
      }
    },
    ROLE_MIGRATION_TEST_TIMINGS.TEST_TIMEOUT_MS,
  );
});
