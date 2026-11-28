import { QueryTypes } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { TIME_UNITS } from '@Constants/time.constant';
import { Quotation } from './entities/quotation.entity';
import { USER_ROLES } from '@Constants/user-role.constant';
import { QuotationRepository } from './quotation.repository';
import { PERMISSIONS } from '@Constants/authorization.constant';
import type { SaveQuotationDto } from './dto/save-quotation.dto';
import { QUOTATION_STATUS } from './constants/quotation.constant';
import { TaskQuotationFixture } from './testing/task-quotation.fixture';
import type { IQuotationDetailView } from './interfaces/quotation-document.interface';
import { QUOTATION_LIFECYCLE_ACTION } from './constants/quotation-lifecycle.constant';
import type { IQuotationLifecycleRecord } from './interfaces/quotation-lifecycle.interface';

const fixture = new TaskQuotationFixture();
jest.setTimeout(2 * TIME_UNITS.MINUTE_MS);

const saveInput = (quotation: IQuotationDetailView): SaveQuotationDto => ({
  version: quotation.version,
  customerId: quotation.customerId,
  projectId: quotation.projectId!,
  date: quotation.date,
  brand: quotation.brand,
  brands: quotation.brands,
  paymentTerms: quotation.paymentTerms,
  paymentTermsNote: quotation.paymentTermsNote,
  paymentSchedule: quotation.paymentSchedule,
  discountPercent: quotation.discountPercent,
  targetPretaxAmount: quotation.targetPretaxAmount,
  internalNotes: quotation.internalNotes,
  sections: [],
});

beforeAll(async (): Promise<void> => {
  await fixture.start();
  await fixture.installLifecycleEvents();
});
afterAll(async (): Promise<void> => {
  await fixture.close();
});

describe('immutable quotation lifecycle PostgreSQL', (): void => {
  it('persists floor order across saves and preserves assignments written by a newer client', async () => {
    const service = fixture.service();
    const created = await service.create(
      { customerId: fixture.customerId, projectId: fixture.projectId },
      fixture.actor,
    );
    const floorId = randomUUID();
    const anotherFloor = randomUUID();
    const system = (
      title: string,
      brand: string | null,
      floor: string | null = null,
    ) => ({
      id: randomUUID(),
      title,
      brand,
      systemType: brand ? ('SINGLE' as const) : ('GEN' as const),
      items: [],
      floorId: floor,
      floorName: floor
        ? floor === floorId
          ? 'Lobby floor'
          : 'Mezzanine'
        : null,
    });
    const sections = [
      system('Shared labor', null),
      system('Roof', 'A'),
      system('Office', 'B', floorId),
      system('Hall', 'A', anotherFloor),
      system('Lobby', 'A', floorId),
    ];
    const saved = await service.save(
      created.id,
      {
        ...saveInput(created),
        brand: 'A',
        brands: ['A', 'B'],
        sections,
      },
      fixture.actor,
    );
    expect(saved.sections.map((section) => section.title)).toEqual([
      'Lobby',
      'Office',
      'Hall',
      'Roof',
      'Shared labor',
    ]);
    expect(saved.sections.map((section) => section.floorId)).toEqual([
      floorId,
      floorId,
      anotherFloor,
      null,
      null,
    ]);
    const olderClientSections = saved.sections.map(
      ({ id, title, brand, systemType }) => ({
        id,
        title,
        brand,
        systemType,
        items: [],
      }),
    );
    const updated = await service.save(
      saved.id,
      {
        ...saveInput(saved),
        sections: olderClientSections,
        internalNotes: 'Staff only',
      },
      fixture.actor,
    );
    expect(
      (await service.getById(updated.id)).sections.map(
        (section) => section.floorId,
      ),
    ).toEqual(saved.sections.map((section) => section.floorId));
    await expect(
      service.save(
        updated.id,
        {
          ...saveInput(updated),
          sections: updated.sections.map((section) => ({
            ...section,
            items: [],
            floorName:
              section.title === 'Office'
                ? 'Conflicting floor'
                : section.floorName,
          })),
        },
        fixture.actor,
      ),
    ).rejects.toThrow();
    expect((await service.getById(updated.id)).version).toBe(updated.version);
  });

  it('records reasonless returns atomically and retains private approval evidence', async (): Promise<void> => {
    const service = fixture.service();
    const created = await service.createForTask(fixture.taskId, fixture.actor);
    const actor = {
      ...fixture.actor,
      assignedRoles: [USER_ROLES.ENGINEERING_LEAD],
      permissions: [
        ...fixture.actor.permissions,
        PERMISSIONS.QUOTATIONS_APPROVE,
      ],
    };
    const approvedAt = new Date('2026-11-01T00:00:00Z');
    await Quotation.update(
      {
        status: QUOTATION_STATUS.APPROVED,
        approvedById: actor.id,
        approvedAt,
        acknowledgedWarnings: ['old-warning'],
      },
      { where: { id: created.quotationId } },
    );
    const before = await service.getById(created.quotationId);
    const returned = await service.transition(
      before.id,
      { status: QUOTATION_STATUS.DRAFT, version: before.version },
      actor,
    );
    expect(returned.lifecycleHistory).toHaveLength(1);
    expect(returned.lifecycleHistory[0]).toMatchObject({
      action: QUOTATION_LIFECYCLE_ACTION.RETURN,
      fromStatus: QUOTATION_STATUS.APPROVED,
      toStatus: QUOTATION_STATUS.DRAFT,
      reason: null,
      actorId: actor.id,
    });
    expect(returned.lifecycleHistory[0]).not.toHaveProperty('evidence');
    expect(returned.approvedAt).toBeNull();
    expect(returned.acknowledgedWarnings).toEqual([]);
    const [rows] = await fixture
      .database()
      .query('SELECT evidence FROM quotation_lifecycle_events');
    expect(rows).toMatchObject([
      {
        evidence: {
          approvedById: actor.id,
          approvedAt: approvedAt.toISOString(),
          acknowledgedWarnings: ['old-warning'],
        },
      },
    ]);
    await expect(
      service.transition(
        before.id,
        { status: QUOTATION_STATUS.DRAFT, version: before.version },
        actor,
      ),
    ).rejects.toThrow();
    await fixture.database().transaction(async (transaction): Promise<void> => {
      expect(
        await new QuotationRepository().lifecycleHistory(
          before.id,
          transaction,
        ),
      ).toHaveLength(1);
    });
  });
  it('serializes competing returns and retains exactly one event for the winning version', async (): Promise<void> => {
    const service = fixture.service();
    const result = await service.createForTask(fixture.taskId, fixture.actor);
    await Quotation.update(
      { status: QUOTATION_STATUS.REVIEW },
      { where: { id: result.quotationId } },
    );
    const current = await service.getById(result.quotationId);
    const actor = {
      ...fixture.actor,
      assignedRoles: [USER_ROLES.ENGINEERING_LEAD],
      permissions: [
        ...fixture.actor.permissions,
        PERMISSIONS.QUOTATIONS_APPROVE,
      ],
    };
    const outcomes = await Promise.allSettled([
      service.transition(
        current.id,
        { version: current.version, status: QUOTATION_STATUS.DRAFT },
        actor,
      ),
      service.transition(
        current.id,
        { version: current.version, status: QUOTATION_STATUS.DRAFT },
        actor,
      ),
    ]);
    expect(
      outcomes.filter((outcome): boolean => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome): boolean => outcome.status === 'rejected'),
    ).toHaveLength(1);
    const latest = await service.getById(current.id);
    expect(latest.version).toBe(current.version + 1);
    expect(
      latest.lifecycleHistory.filter(
        (event): boolean => event.quotationVersion === latest.version,
      ),
    ).toHaveLength(1);
  });
  it('audits review autosave with prior evidence and leaves draft autosave without extra events', async (): Promise<void> => {
    const service = fixture.service();
    const result = await service.createForTask(fixture.taskId, fixture.actor);
    const approvedAt = new Date('2026-11-02T00:00:00Z');
    await Quotation.update(
      {
        status: QUOTATION_STATUS.REVIEW,
        approvedById: fixture.actor.id,
        approvedAt,
        acknowledgedWarnings: ['prior-review-warning'],
        paymentTermsNote: 'Prior payment evidence',
      },
      { where: { id: result.quotationId } },
    );
    const before = await service.getById(result.quotationId);
    const input = { ...saveInput(before), paymentTermsNote: 'Updated terms' };
    const saved = await service.save(before.id, input, fixture.actor);
    expect(saved.status).toBe(QUOTATION_STATUS.DRAFT);
    expect(saved.version).toBe(before.version + 1);
    expect(saved.lifecycleHistory).toHaveLength(
      before.lifecycleHistory.length + 1,
    );
    expect(saved.lifecycleHistory.at(-1)).toMatchObject({
      actorId: fixture.actor.id,
      fromStatus: QUOTATION_STATUS.REVIEW,
      toStatus: QUOTATION_STATUS.DRAFT,
      action: QUOTATION_LIFECYCLE_ACTION.RETURN,
      quotationVersion: saved.version,
    });
    const [event] = await fixture
      .database()
      .query<Pick<IQuotationLifecycleRecord, 'evidence'>>(
        'SELECT evidence FROM quotation_lifecycle_events WHERE quotation_id=$id AND quotation_version=$version',
        {
          bind: { id: saved.id, version: saved.version },
          type: QueryTypes.SELECT,
        },
      );
    expect(event.evidence).toMatchObject({
      approvedAt: approvedAt.toISOString(),
      approvedById: fixture.actor.id,
      acknowledgedWarnings: ['prior-review-warning'],
      paymentTermsNote: 'Prior payment evidence',
      ruleConfiguration: before.ruleConfiguration,
      paymentSchedule: before.paymentSchedule,
    });
    await expect(
      service.save(before.id, input, fixture.actor),
    ).rejects.toThrow();
    const draftSaved = await service.save(
      saved.id,
      saveInput(saved),
      fixture.actor,
    );
    expect(draftSaved.lifecycleHistory).toHaveLength(
      saved.lifecycleHistory.length,
    );
  });
  it('rolls back a review save audit when quotation persistence fails', async (): Promise<void> => {
    const service = fixture.service();
    const result = await service.createForTask(fixture.taskId, fixture.actor);
    await Quotation.update(
      { status: QUOTATION_STATUS.REVIEW },
      { where: { id: result.quotationId } },
    );
    const before = await service.getById(result.quotationId);
    const persistence = jest
      .spyOn(QuotationRepository.prototype, 'update')
      .mockRejectedValueOnce(new Error('Forced save persistence failure'));
    try {
      await expect(
        service.save(before.id, saveInput(before), fixture.actor),
      ).rejects.toThrow('Forced save persistence failure');
    } finally {
      persistence.mockRestore();
    }
    const after = await service.getById(before.id);
    expect(after.version).toBe(before.version);
    expect(after.status).toBe(QUOTATION_STATUS.REVIEW);
    expect(after.lifecycleHistory).toEqual(before.lifecycleHistory);
  });
  it('rejects modification, deletion, truncation and browser role reads', async (): Promise<void> => {
    await expect(
      fixture
        .database()
        .query('UPDATE quotation_lifecycle_events SET actor_name=actor_name'),
    ).rejects.toThrow('immutable');
    await expect(
      fixture.database().query('DELETE FROM quotation_lifecycle_events'),
    ).rejects.toThrow('immutable');
    await expect(
      fixture.database().query('TRUNCATE quotation_lifecycle_events'),
    ).rejects.toThrow('immutable');
    await fixture.database().transaction(async (transaction): Promise<void> => {
      await fixture
        .database()
        .query('SET LOCAL ROLE authenticated', { transaction });
      await expect(
        fixture
          .database()
          .query('SELECT * FROM quotation_lifecycle_events', { transaction }),
      ).rejects.toThrow('permission denied');
    });
  });
});
