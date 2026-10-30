import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Sequelize } from 'sequelize-typescript';
import { User } from '@Modules/user/entities/user.entity';
import { USER_ROLES } from '@Constants/user-role.constant';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { CustomerRepository } from '@Modules/customer/customer.repository';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';
import { PRIORITY_SYNC_STATUSES } from '@Modules/customer/constants/priority-sync-status.constant';

const databaseUrl = process.env.CUSTOMER_PAGINATION_TEST_DATABASE_URL ?? '';
const schema = `customer_pagination_${randomUUID().replaceAll('-', '')}`;
const repository = new CustomerRepository();
const emptyFilter = { search: null, prioritySyncStatus: null };
const fixtureIds = {
  older: '00000000-0000-4000-8000-000000000001',
  middle: '00000000-0000-4000-8000-000000000002',
  newest: '00000000-0000-4000-8000-000000000003',
  deleted: '00000000-0000-4000-8000-000000000004',
  contactFirst: '00000000-0000-4000-8000-000000000011',
  contactSecond: '00000000-0000-4000-8000-000000000012',
  contactThird: '00000000-0000-4000-8000-000000000013',
  contactDeleted: '00000000-0000-4000-8000-000000000014',
  middleContact: '00000000-0000-4000-8000-000000000015',
};
const state: { sequelize: Sequelize | null } = { sequelize: null };

describe('customer contact pagination against isolated PostgreSQL', () => {
  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error(
        'Set CUSTOMER_PAGINATION_TEST_DATABASE_URL to a disposable local *_e2e database.',
      );
    }

    const target = new URL(databaseUrl);
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(
      target.hostname,
    );
    const isDisposable = target.pathname.endsWith('_e2e');
    if (!isLoopback || !isDisposable) {
      throw new Error(
        'Customer pagination integration tests require a local disposable *_e2e database.',
      );
    }

    const sequelize = new Sequelize(databaseUrl, {
      logging: false,
      models: [User, Customer, CustomerContact],
      define: { schema, underscored: true, timestamps: true },
    });
    state.sequelize = sequelize;
    await sequelize.getQueryInterface().createSchema(schema, {});
    await sequelize.sync();

    const user = await User.create({
      phone: '03-1234567',
      firstName: 'בדיקה',
      lastName: 'זמנית',
      passwordHash: 'disposable-test-hash',
      email: 'pagination@example.invalid',
      role: USER_ROLES.SYSTEM_ADMIN,
    });
    const customers = [
      {
        id: fixtureIds.older,
        name: 'לקוח ללא אנשי קשר',
        taxId: '100000001',
        prioritySyncStatus: PRIORITY_SYNC_STATUSES.PENDING,
      },
      {
        id: fixtureIds.middle,
        name: 'לקוח מסונן יחיד',
        taxId: '100000002',
        prioritySyncStatus: PRIORITY_SYNC_STATUSES.FAILED,
      },
      {
        id: fixtureIds.newest,
        name: 'לקוח מסונן מרובה',
        taxId: '100000003',
        prioritySyncStatus: PRIORITY_SYNC_STATUSES.PENDING,
      },
      {
        id: fixtureIds.deleted,
        name: 'לקוח מוסר',
        taxId: '100000004',
        prioritySyncStatus: PRIORITY_SYNC_STATUSES.PENDING,
      },
    ].map((customer) => ({
      ...customer,
      phone: '03-1234567',
      contactName: 'פרט היסטורי',
      address: 'כתובת לבדיקה בלבד',
      email: 'customer@example.invalid',
      createdById: user.id,
      customerType: PROJECT_DETAIL_FIELD_SETS.COMPANY,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
    }));
    await Customer.bulkCreate(customers);
    await Customer.destroy({ where: { id: fixtureIds.deleted } });

    const contacts = [
      {
        id: fixtureIds.contactThird,
        customerId: fixtureIds.newest,
        name: 'שלישי',
        createdAt: new Date('2026-10-02T00:00:00.000Z'),
      },
      {
        id: fixtureIds.contactSecond,
        customerId: fixtureIds.newest,
        name: 'שני',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
      },
      {
        id: fixtureIds.contactFirst,
        customerId: fixtureIds.newest,
        name: 'ראשון',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
      },
      {
        id: fixtureIds.contactDeleted,
        customerId: fixtureIds.newest,
        name: 'איש קשר מוסר',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      {
        id: fixtureIds.middleContact,
        customerId: fixtureIds.middle,
        name: 'איש קשר יחיד',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    ].map((contact) => ({
      ...contact,
      phone: null,
      email: null,
      role: null,
      createdById: user.id,
    }));
    await CustomerContact.bulkCreate(contacts);
    await CustomerContact.destroy({ where: { id: fixtureIds.contactDeleted } });
  });

  afterAll(async () => {
    const sequelize = state.sequelize;
    if (!sequelize) {
      return;
    }

    try {
      await sequelize.dropSchema(schema, {});
    } finally {
      await sequelize.close();
    }
  });

  it('returns complete ordered active contact collections without multiplying customer pages', async () => {
    const first = await repository.findByFilter(emptyFilter, {
      batchSize: 2,
      batchCursor: null,
    });
    expect(first.items.map((customer) => customer.id)).toEqual([
      fixtureIds.newest,
      fixtureIds.middle,
    ]);
    expect(first.items[0].contacts?.map((contact) => contact.id)).toEqual([
      fixtureIds.contactFirst,
      fixtureIds.contactSecond,
      fixtureIds.contactThird,
    ]);
    expect(first.items[1].contacts?.map((contact) => contact.id)).toEqual([
      fixtureIds.middleContact,
    ]);
    expect(first.nextCursor).not.toBeNull();

    const second = await repository.findByFilter(emptyFilter, {
      batchSize: 2,
      batchCursor: first.nextCursor,
    });
    expect(second.items.map((customer) => customer.id)).toEqual([
      fixtureIds.older,
    ]);
    expect(second.items[0].contacts).toEqual([]);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.items, ...second.items].map((customer) => customer.id))
        .size,
    ).toBe(3);
  });

  it('keeps search and sync filters while including the matched customers contacts', async () => {
    const result = await repository.findByFilter(
      { search: 'מסונן', prioritySyncStatus: PRIORITY_SYNC_STATUSES.FAILED },
      { batchSize: 1, batchCursor: null },
    );
    expect(result.items.map((customer) => customer.id)).toEqual([
      fixtureIds.middle,
    ]);
    expect(result.items[0].contacts?.map((contact) => contact.id)).toEqual([
      fixtureIds.middleContact,
    ]);
    expect(result.nextCursor).toBeNull();
  });
});
