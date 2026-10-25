import { Sequelize } from 'sequelize-typescript';
import { User } from '@Modules/user/entities/user.entity';
import { toAuthorizedUser } from './authorized-user.utility';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { authorizedUser } from '../../../testing/authorization.fixture';

const sequelize = new Sequelize({
  dialect: 'postgres',
  logging: false,
  models: [User],
});

describe('authorized user projection', () => {
  afterAll(async () => sequelize.close());

  it('serializes actual Sequelize attributes without exposing ORM internals or password hashes', () => {
    const identity = authorizedUser();
    const user = User.build({
      ...identity,
      passwordHash: 'private-test-hash',
    });
    const result = toAuthorizedUser(user, [PERMISSIONS.PROJECTS_CREATE]);

    expect(result).toEqual({
      ...identity,
      permissions: [PERMISSIONS.PROJECTS_CREATE],
    });
    expect(JSON.stringify(result)).not.toContain('private-test-hash');
    expect(result).not.toHaveProperty('dataValues');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('preserves an empty grant list without deriving defaults from the role', () => {
    const identity = authorizedUser([PERMISSIONS.PROJECTS_CREATE]);

    expect(toAuthorizedUser(identity, []).permissions).toEqual([]);
  });
});
