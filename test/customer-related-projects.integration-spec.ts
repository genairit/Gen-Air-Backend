import {
  TCustomerProjectEnvironment,
  createCustomerProjectEnvironment,
} from './customer-related-projects.fixture';

import { QueryTypes } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { USER_ROLES } from '@Constants/user-role.constant';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { Project } from '@Modules/project/entities/project.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';
import { ProjectMember } from '@Modules/project-member/entities/project-member.entity';
import { CUSTOMER_PROJECT_KINDS } from '@Modules/project/constants/customer-project.constant';
import { encodeCustomerProjectCursor } from '@Modules/project/utilities/customer-project-cursor.utility';

const state: { environment: TCustomerProjectEnvironment | null } = {
  environment: null,
};

interface IProjectOrderRow {
  id: string;
  name: string;
  updatedAt: Date;
}

const getEnvironment = () => {
  if (!state.environment) {
    throw new Error(
      'The isolated customer project environment is not initialized.',
    );
  }

  return state.environment;
};

describe('customer related projects against isolated PostgreSQL', () => {
  beforeAll(async () => {
    state.environment = await createCustomerProjectEnvironment();
  });

  afterAll(async () => {
    await state.environment?.close();
  });

  it('returns no related rows or counts for an existing customer without projects', async () => {
    const environment = getEnvironment();
    const customer = await environment.customer();
    const page = await environment.projects.getPage(customer.id, {});

    expect(page).toEqual({
      items: [],
      total: 0,
      counts: { total: 0, byStage: {} },
      nextCursor: null,
    });
  });

  it('uses customer IDs rather than identical customer or project names', async () => {
    const environment = getEnvironment();
    const [customer, other] = await Promise.all([
      environment.customer(),
      environment.customer(),
    ]);
    const owned = await environment.project({
      customerId: customer.id,
      name: 'אותו שם',
    });
    await environment.project({ customerId: other.id, name: 'אותו שם' });
    const page = await environment.projects.getPage(customer.id, {});

    expect(page.items.map((item) => item.id)).toEqual([owned.id]);
    expect(page.total).toBe(1);
    expect(page.counts.total).toBe(1);
  });

  it('groups directly linked and inherited apartments inside the customer building without duplicate rows', async () => {
    const environment = getEnvironment();
    const [customer, other] = await Promise.all([
      environment.customer(),
      environment.customer(),
    ]);
    const building = await environment.project({
      customerId: customer.id,
      projectTypeId: environment.buildingTypeId,
    });
    await environment.project({
      customerId: customer.id,
      parentProjectId: building.id,
      projectTypeId: environment.buildingTypeId,
    });
    await environment.project({
      customerId: null,
      parentProjectId: building.id,
      projectTypeId: environment.buildingTypeId,
    });
    await environment.project({
      customerId: other.id,
      parentProjectId: building.id,
      projectTypeId: environment.buildingTypeId,
    });
    const page = await environment.projects.getPage(customer.id, {});

    expect(page.items.map((item) => item.id)).toEqual([building.id]);
    expect(page.items[0]).toMatchObject({
      kind: CUSTOMER_PROJECT_KINDS.BUILDING,
      apartmentCount: 3,
      building: null,
      parentProjectId: null,
    });
    expect(page.total).toBe(1);
    expect(page.counts).toEqual({
      total: 1,
      byStage: { [PROJECT_STATUS_IDS.DRAFT]: 1 },
    });
  });

  it('lists only a directly linked apartment under another customer building, with limited parent context', async () => {
    const environment = getEnvironment();
    const [customer, other] = await Promise.all([
      environment.customer(),
      environment.customer(),
    ]);
    const building = await environment.project({
      customerId: other.id,
      name: 'בניין של לקוח אחר',
      projectTypeId: environment.buildingTypeId,
    });
    const apartment = await environment.project({
      customerId: customer.id,
      parentProjectId: building.id,
      projectTypeId: environment.buildingTypeId,
    });
    await environment.project({
      customerId: null,
      parentProjectId: building.id,
      projectTypeId: environment.buildingTypeId,
    });
    const page = await environment.projects.getPage(customer.id, {});

    expect(page.items.map((item) => item.id)).toEqual([apartment.id]);
    expect(page.items[0]).toMatchObject({
      kind: CUSTOMER_PROJECT_KINDS.APARTMENT,
      apartmentCount: 0,
      building: { id: building.id, name: building.name, code: building.code },
    });
    expect(Object.keys(page.items[0].building ?? {}).sort()).toEqual([
      'code',
      'id',
      'name',
    ]);
    expect(page.items[0]).not.toHaveProperty('customer');
    expect(page.items[0]).not.toHaveProperty('parentProject');
  });

  it('does not hide a directly linked apartment when the parent has no customer', async () => {
    const environment = getEnvironment();
    const customer = await environment.customer();
    const building = await environment.project({
      customerId: null,
      projectTypeId: environment.buildingTypeId,
    });
    const apartment = await environment.project({
      customerId: customer.id,
      parentProjectId: building.id,
      projectTypeId: environment.buildingTypeId,
    });
    const page = await environment.projects.getPage(customer.id, {});

    expect(page.items.map((item) => item.id)).toEqual([apartment.id]);
    expect(page.items[0].kind).toBe(CUSTOMER_PROJECT_KINDS.APARTMENT);
  });

  it('excludes deleted projects, deleted apartments from building counts, and apartments with deleted parents', async () => {
    const environment = getEnvironment();
    const [customer, other] = await Promise.all([
      environment.customer(),
      environment.customer(),
    ]);
    const building = await environment.project({
      customerId: customer.id,
      projectTypeId: environment.buildingTypeId,
    });
    const removed = await environment.project({ customerId: customer.id });
    await removed.destroy();
    const child = await environment.project({
      customerId: customer.id,
      parentProjectId: building.id,
      projectTypeId: environment.buildingTypeId,
    });
    await child.destroy();
    const removedParent = await environment.project({
      customerId: other.id,
      projectTypeId: environment.buildingTypeId,
    });
    await environment.project({
      customerId: customer.id,
      parentProjectId: removedParent.id,
      projectTypeId: environment.buildingTypeId,
    });
    await removedParent.destroy();
    const page = await environment.projects.getPage(customer.id, {});

    expect(page.items.map((item) => item.id)).toEqual([building.id]);
    expect(page.items[0].apartmentCount).toBe(0);
    expect(page.total).toBe(1);
    expect(page.counts.total).toBe(1);
  });

  it('paginates more than eighteen rows with stable updatedAt/name/ID ties without gaps or duplicate IDs', async () => {
    const environment = getEnvironment();
    const customer = await environment.customer();
    const dates = [
      '2026-10-30T14:00:00.000Z',
      '2026-10-30T13:00:00.000Z',
      '2026-10-30T12:00:00.000Z',
    ];
    const names = ['Alpha', 'Beta', 'Gamma'];
    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        environment.project({
          id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          customerId: customer.id,
          name: names[index % names.length],
          updatedAt: dates[Math.floor(index / 9)],
        }),
      ),
    );
    const expected = await environment.sequelize.query<IProjectOrderRow>(
      'SELECT id,name,updated_at AS "updatedAt" FROM public.projects WHERE customer_id=$customer ORDER BY updated_at DESC, name ASC, id ASC',
      { type: QueryTypes.SELECT, bind: { customer: customer.id } },
    );
    const first = await environment.projects.getPage(customer.id, {});
    const second = await environment.projects.getPage(customer.id, {
      batchCursor: first.nextCursor ?? '',
    });
    const third = await environment.projects.getPage(customer.id, {
      batchSize: 10,
      batchCursor: second.nextCursor ?? '',
    });
    const actual = [...first.items, ...second.items, ...third.items].map(
      (item) => item.id,
    );

    expect(first.items).toHaveLength(8);
    expect(
      expected.filter(
        (row) =>
          row.name === 'Alpha' && row.updatedAt.toISOString() === dates[0],
      ),
    ).toHaveLength(3);
    expect(second.items).toHaveLength(10);
    expect(third.items).toHaveLength(7);
    expect(third.nextCursor).toBeNull();
    expect(actual).toEqual(expected.map((row) => row.id));
    expect(new Set(actual).size).toBe(25);
    expect(first.total).toBe(25);
    expect(third.counts.total).toBe(25);
  });

  it('filters search literally and stage rows while retaining search-matched stage counts and overall customer total', async () => {
    const environment = getEnvironment();
    const customer = await environment.customer();
    const draft = await environment.project({
      customerId: customer.id,
      name: 'מחסן %_ מיוחד',
    });
    await environment.project({
      customerId: customer.id,
      name: 'מחסן %_ נוסף',
      stageId: PROJECT_STATUS_IDS.IN_PROGRESS,
    });
    await environment.project({ customerId: customer.id, name: 'מחסן רגיל' });
    const page = await environment.projects.getPage(customer.id, {
      search: '%_',
      stageId: PROJECT_STATUS_IDS.DRAFT,
    });

    expect(page.items.map((item) => item.id)).toEqual([draft.id]);
    expect(page.total).toBe(3);
    expect(page.counts).toEqual({
      total: 2,
      byStage: {
        [PROJECT_STATUS_IDS.DRAFT]: 1,
        [PROJECT_STATUS_IDS.IN_PROGRESS]: 1,
      },
    });
  });

  it('continues through valid Unicode project-name cursors at the surrogate-pair and database length boundaries', async () => {
    const environment = getEnvironment();
    const customer = await environment.customer();
    const surrogateBoundaryName = '😀'.repeat(
      Math.floor(FIELD_LENGTHS.PROJECT_NAME / 2) + 1,
    );
    const maximumName = '😀'.repeat(FIELD_LENGTHS.PROJECT_NAME);
    const surrogateBoundary = await environment.project({
      customerId: customer.id,
      name: surrogateBoundaryName,
      updatedAt: '2026-10-30T15:00:00.000Z',
    });
    const maximum = await environment.project({
      customerId: customer.id,
      name: maximumName,
      updatedAt: '2026-10-30T14:00:00.000Z',
    });
    const last = await environment.project({
      customerId: customer.id,
      name: 'סיום',
      updatedAt: '2026-10-30T13:00:00.000Z',
    });
    const first = await environment.projects.getPage(customer.id, {
      batchSize: 1,
    });
    const second = await environment.projects.getPage(customer.id, {
      batchSize: 1,
      batchCursor: first.nextCursor ?? '',
    });
    const third = await environment.projects.getPage(customer.id, {
      batchSize: 1,
      batchCursor: second.nextCursor ?? '',
    });
    const ids = [...first.items, ...second.items, ...third.items].map(
      (item) => item.id,
    );

    expect(surrogateBoundaryName.length).toBeGreaterThan(
      FIELD_LENGTHS.PROJECT_NAME,
    );
    expect(Array.from(maximumName)).toHaveLength(FIELD_LENGTHS.PROJECT_NAME);
    expect(first.items[0].name).toBe(surrogateBoundaryName);
    expect(second.items[0].name).toBe(maximumName);
    expect(ids).toEqual([surrogateBoundary.id, maximum.id, last.id]);
    expect(new Set(ids).size).toBe(3);
    expect(third.nextCursor).toBeNull();
    expect(third.total).toBe(3);
  });

  it('keeps member joins from duplicating rows or consuming a cursor page before the next project', async () => {
    const environment = getEnvironment();
    const customer = await environment.customer();
    const alpha = await environment.project({
      customerId: customer.id,
      name: 'Alpha',
    });
    const beta = await environment.project({
      customerId: customer.id,
      name: 'Beta',
    });
    const gamma = await environment.project({
      customerId: customer.id,
      name: 'Gamma',
    });
    await ProjectMember.create({
      projectId: alpha.id,
      userId: environment.engineer.id,
      role: USER_ROLES.ENGINEER,
    });
    await ProjectMember.create({
      projectId: alpha.id,
      userId: environment.manager.id,
      role: USER_ROLES.PROJECT_MANAGER,
    });
    const first = await environment.projects.getPage(customer.id, {
      batchSize: 1,
    });
    const second = await environment.projects.getPage(customer.id, {
      batchSize: 1,
      batchCursor: first.nextCursor ?? '',
    });
    const third = await environment.projects.getPage(customer.id, {
      batchSize: 1,
      batchCursor: second.nextCursor ?? '',
    });

    expect(first.items[0].id).toBe(alpha.id);
    expect(first.items[0].members).toHaveLength(2);
    expect(
      [...first.items, ...second.items, ...third.items].map((item) => item.id),
    ).toEqual([alpha.id, beta.id, gamma.id]);
    expect(third.nextCursor).toBeNull();
    expect(first.total).toBe(3);
    expect(first.counts.total).toBe(3);
  });

  it('finds an externally owned building context by name and code without returning that building or its other apartments', async () => {
    const environment = getEnvironment();
    const [customer, other] = await Promise.all([
      environment.customer(),
      environment.customer(),
    ]);
    const building = await environment.project({
      customerId: other.id,
      name: 'בניין הקשר ייחודי',
      projectTypeId: environment.buildingTypeId,
    });
    const apartment = await environment.project({
      customerId: customer.id,
      parentProjectId: building.id,
      projectTypeId: environment.buildingTypeId,
    });
    await environment.project({
      customerId: other.id,
      parentProjectId: building.id,
      projectTypeId: environment.buildingTypeId,
    });

    for (const search of [building.name, building.code]) {
      const page = await environment.projects.getPage(customer.id, { search });
      expect(page.items.map((item) => item.id)).toEqual([apartment.id]);
      expect(page.total).toBe(1);
      expect(page.counts.total).toBe(1);
    }
  });

  it('rejects a valid encoded cursor belonging to another customer/search/stage and rejects missing or archived customers', async () => {
    const environment = getEnvironment();
    const [customer, other] = await Promise.all([
      environment.customer(),
      environment.customer(),
    ]);
    const project = await environment.project({
      customerId: customer.id,
      name: 'עוגן',
    });
    const cursor = encodeCustomerProjectCursor({
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      customerId: customer.id,
      search: '',
      stageId: null,
    });

    await expect(
      environment.projects.getPage(other.id, { batchCursor: cursor }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      environment.projects.getPage(customer.id, {
        batchCursor: cursor,
        search: 'שינוי',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      environment.projects.getPage(customer.id, {
        batchCursor: cursor,
        stageId: PROJECT_STATUS_IDS.DRAFT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      environment.projects.getPage(randomUUID(), {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    await other.destroy();
    await expect(
      environment.projects.getPage(other.id, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses inherited or own apartment teams and returns only limited employee identity fields', async () => {
    const environment = getEnvironment();
    const [customer, other] = await Promise.all([
      environment.customer(),
      environment.customer(),
    ]);
    const building = await environment.project({
      customerId: other.id,
      projectTypeId: environment.buildingTypeId,
    });
    const inherited = await environment.project({
      customerId: customer.id,
      parentProjectId: building.id,
      projectTypeId: environment.buildingTypeId,
    });
    const owned = await environment.project({
      customerId: customer.id,
      parentProjectId: building.id,
      projectTypeId: environment.buildingTypeId,
      hasOwnTeam: true,
    });
    await ProjectMember.create({
      projectId: building.id,
      userId: environment.engineer.id,
      role: USER_ROLES.ENGINEER,
    });
    await ProjectMember.create({
      projectId: owned.id,
      userId: environment.manager.id,
      role: USER_ROLES.PROJECT_MANAGER,
    });
    const page = await environment.projects.getPage(customer.id, {});
    const inheritedRow = page.items.find((item) => item.id === inherited.id);
    const ownedRow = page.items.find((item) => item.id === owned.id);

    expect(inheritedRow?.members.map((member) => member.user?.id)).toEqual([
      environment.engineer.id,
    ]);
    expect(ownedRow?.members.map((member) => member.user?.id)).toEqual([
      environment.manager.id,
    ]);
    expect(Object.keys(inheritedRow?.members[0].user ?? {}).sort()).toEqual([
      'firstName',
      'id',
      'lastName',
    ]);
    expect(JSON.stringify(page.items)).not.toContain('passwordHash');
    expect(JSON.stringify(page.items)).not.toContain(
      environment.engineer.email,
    );
  });

  it('recomputes grouping and counts after building/customer association changes without modifying unrelated projects', async () => {
    const environment = getEnvironment();
    const [customer, other] = await Promise.all([
      environment.customer(),
      environment.customer(),
    ]);
    const building = await environment.project({
      customerId: other.id,
      projectTypeId: environment.buildingTypeId,
    });
    const apartment = await environment.project({
      customerId: customer.id,
      parentProjectId: building.id,
      projectTypeId: environment.buildingTypeId,
    });
    const first = await environment.projects.getPage(customer.id, {});
    expect(first.items.map((item) => item.id)).toEqual([apartment.id]);

    await building.update({ customerId: customer.id });
    const afterBuildingMove = await environment.projects.getPage(
      customer.id,
      {},
    );
    expect(afterBuildingMove.items.map((item) => item.id)).toEqual([
      building.id,
    ]);
    expect(afterBuildingMove.items[0].apartmentCount).toBe(1);
    expect(afterBuildingMove.counts.total).toBe(1);

    await Project.update(
      { customerId: other.id },
      { where: { id: apartment.id } },
    );
    const afterApartmentMove = await environment.projects.getPage(other.id, {});
    expect(afterApartmentMove.items.map((item) => item.id)).toEqual([
      apartment.id,
    ]);
    expect(afterApartmentMove.total).toBe(1);
    expect(afterApartmentMove.counts.total).toBe(1);
  });
});
