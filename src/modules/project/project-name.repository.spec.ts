import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  makeCustomerProjectParent,
  CUSTOMER_PROJECT_TEST_IDS,
} from '../../testing/customer-project.fixture';

import { Sequelize } from 'sequelize-typescript';
import { Project } from './entities/project.entity';
import { ProjectRepository } from './project.repository';
import { User } from '@Modules/user/entities/user.entity';
import { QueryTypes, UniqueConstraintError } from 'sequelize';
import { PROJECT_NAME } from './constants/project-name.constant';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { ProjectType } from '@Modules/project-type/entities/project-type.entity';
import { ProjectStage } from '@Modules/project-stage/entities/project-stage.entity';
import { ProjectMember } from '@Modules/project-member/entities/project-member.entity';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';

const uniqueError = (constraint: string) =>
  new UniqueConstraintError({
    parent: Object.assign(new Error('duplicate key'), {
      constraint,
      sql: 'INSERT INTO projects',
    }),
  });

describe('project name repository boundary', () => {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    logging: false,
    models: [
      User,
      Customer,
      CustomerContact,
      ProjectType,
      ProjectStage,
      Project,
      ProjectMember,
    ],
  });
  const repository = new ProjectRepository();

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await sequelize.close();
  });

  it.each([true, false])(
    'returns the inverse of real existence=%s without broader name matching',
    async (exists) => {
      const query = jest.fn().mockResolvedValue([{ exists }]);
      jest.spyOn(sequelize, 'query').mockImplementation(query);
      expect(
        await repository.isNameAvailable(
          '\u00a0Building  A\u3000',
          CUSTOMER_PROJECT_TEST_IDS.PROJECT,
        ),
      ).toBe(!exists);
      expect(query).toHaveBeenCalledWith(
        expect.stringMatching(/deleted_at IS NULL.*COLLATE "C"/),
        {
          type: QueryTypes.SELECT,
          bind: {
            name: 'Building  A',
            excludedId: CUSTOMER_PROJECT_TEST_IDS.PROJECT,
            trimCharacters: PROJECT_NAME.TRIM_CHARACTERS,
          },
        },
      );
    },
  );

  it('passes null own-record exclusion for creation', async () => {
    const query = jest.fn().mockResolvedValue([{ exists: false }]);
    jest.spyOn(sequelize, 'query').mockImplementation(query);
    await expect(repository.isNameAvailable('חדש', null)).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(expect.any(String), {
      type: QueryTypes.SELECT,
      bind: {
        name: 'חדש',
        excludedId: null,
        trimCharacters: PROJECT_NAME.TRIM_CHARACTERS,
      },
    });
  });

  it.each([null, 0, 'false', {}, []])(
    'rejects malformed existence result %p rather than treating it as available',
    async (exists) => {
      jest
        .spyOn(sequelize, 'query')
        .mockImplementation(jest.fn().mockResolvedValue([{ exists }]));
      await expect(repository.isNameAvailable('שם', null)).rejects.toThrow(
        InternalServerErrorException,
      );
    },
  );

  it('rejects a missing database response row', async () => {
    jest
      .spyOn(sequelize, 'query')
      .mockImplementation(jest.fn().mockResolvedValue([]));
    await expect(repository.isNameAvailable('שם', null)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('reports database unavailability without attempting a lookup', async () => {
    const previous = Project.sequelize;
    Reflect.set(Project, 'sequelize', null);
    try {
      await expect(repository.isNameAvailable('שם', null)).rejects.toThrow(
        InternalServerErrorException,
      );
    } finally {
      Reflect.set(Project, 'sequelize', previous);
    }
  });

  it('preserves a database connection failure', async () => {
    const error = new Error('connection lost');
    jest.spyOn(sequelize, 'query').mockRejectedValue(error);
    await expect(repository.isNameAvailable('שם', null)).rejects.toBe(error);
  });

  it('trims newly created names before persistence', async () => {
    const attributes = makeCustomerProjectParent({ name: '\t חדש  א\u00a0' });
    const row = Project.build(attributes);
    const create = jest.spyOn(Project, 'create').mockResolvedValue(row);
    await expect(repository.create(attributes)).resolves.toBe(row);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'חדש  א' }),
      expect.any(Object),
    );
  });

  it.each(['create', 'update'] as const)(
    'maps exact-name races from %s to the domain conflict',
    async (operation) => {
      const error = uniqueError(PROJECT_NAME.UNIQUE_INDEX);
      const attributes = makeCustomerProjectParent();
      jest.spyOn(Project, 'create').mockRejectedValue(error);
      jest.spyOn(Project, 'update').mockRejectedValue(error);
      const writes = {
        create: () => repository.create(attributes),
        update: () =>
          repository.update(attributes.id, { name: attributes.name }),
      };
      await expect(writes[operation]()).rejects.toThrow(ConflictException);
    },
  );

  it.each(['create', 'update'] as const)(
    'preserves an unrelated uniqueness failure from %s',
    async (operation) => {
      const error = uniqueError('projects_code_key');
      const attributes = makeCustomerProjectParent();
      jest.spyOn(Project, 'create').mockRejectedValue(error);
      jest.spyOn(Project, 'update').mockRejectedValue(error);
      const writes = {
        create: () => repository.create(attributes),
        update: () =>
          repository.update(attributes.id, { name: attributes.name }),
      };
      await expect(writes[operation]()).rejects.toBe(error);
    },
  );
});
