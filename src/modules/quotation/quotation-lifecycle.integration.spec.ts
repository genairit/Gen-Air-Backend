import { TIME_UNITS } from '@Constants/time.constant';
import { Quotation } from './entities/quotation.entity';
import { USER_ROLES } from '@Constants/user-role.constant';
import { QuotationRepository } from './quotation.repository';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { QUOTATION_STATUS } from './constants/quotation.constant';
import { TaskQuotationFixture } from './testing/task-quotation.fixture';
import { QUOTATION_LIFECYCLE_ACTION } from './constants/quotation-lifecycle.constant';

const fixture = new TaskQuotationFixture();
jest.setTimeout(2 * TIME_UNITS.MINUTE_MS);

beforeAll(async (): Promise<void> => {
  await fixture.start();
  await fixture.installLifecycleEvents();
});
afterAll(async (): Promise<void> => {
  await fixture.close();
});

describe('immutable quotation lifecycle PostgreSQL', (): void => {
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
