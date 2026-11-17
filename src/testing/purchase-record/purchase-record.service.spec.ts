import type {
  IProjectBoqLine,
  IProjectBoqView,
} from '@Modules/project-boq/interfaces/project-boq.interface';

import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import type { Transaction } from 'sequelize';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ProjectBoqService } from '@Modules/project-boq/project-boq.service';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { PurchaseRecordService } from '@Modules/purchase-record/purchase-record.service';
import { PurchaseRecord } from '@Modules/purchase-record/entities/purchase-record.entity';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { PurchaseRecordRepository } from '@Modules/purchase-record/purchase-record.repository';
import { PurchaseRecordLine } from '@Modules/purchase-record/entities/purchase-record-line.entity';
import { PurchaseRecordEvent } from '@Modules/purchase-record/entities/purchase-record-event.entity';
import type { CreatePurchaseRecordDto } from '@Modules/purchase-record/dto/create-purchase-record.dto';
import { PurchaseRecordCorrection } from '@Modules/purchase-record/entities/purchase-record-correction.entity';

const projectId = randomUUID();
const boqLineId = randomUUID();
const actorId = randomUUID();
const fullUser = mock<IAuthorizedUser>({
  id: actorId,
  permissions: [
    PERMISSIONS.PURCHASE_REQUESTS_REVIEW,
    PERMISSIONS.PURCHASE_ORDERS_APPROVE,
  ],
});
const restrictedUser = mock<IAuthorizedUser>({
  id: randomUUID(),
  permissions: [PERMISSIONS.PURCHASE_REQUESTS_REVIEW],
});

const input = (
  quantity: string,
  idempotencyKey = randomUUID(),
  exceptionReason?: string,
): CreatePurchaseRecordDto => ({
  idempotencyKey,
  lines: [{ boqLineId, quantity }],
  supplierName: 'ספק א',
  orderDate: '2026-11-17',
  exceptionReason,
});

const setup = () => {
  const state = {
    records: [] as PurchaseRecord[],
    lines: [] as PurchaseRecordLine[],
    events: [] as PurchaseRecordEvent[],
    corrections: [] as PurchaseRecordCorrection[],
  };
  const repository = mock<PurchaseRecordRepository>();
  repository.records.mockImplementation(() =>
    Promise.resolve(
      state.records.filter(
        (record) => record.status !== 'draft' && record.status !== 'cancelled',
      ),
    ),
  );
  repository.historyPage.mockImplementation(() =>
    Promise.resolve([...state.records]),
  );
  repository.record.mockImplementation((id, scope) =>
    Promise.resolve(
      state.records.find(
        (record) => record.id === id && record.projectId === scope,
      ) ?? null,
    ),
  );
  repository.command.mockImplementation((scope, actor, key) =>
    Promise.resolve(
      state.records.find(
        (record) =>
          record.projectId === scope &&
          record.createdById === actor &&
          record.idempotencyKey === key,
      ) ?? null,
    ),
  );
  repository.lines.mockImplementation((ids) =>
    Promise.resolve(state.lines.filter((line) => ids.includes(line.recordId))),
  );
  repository.events.mockImplementation((ids) =>
    Promise.resolve(
      state.events.filter((event) => ids.includes(event.recordId)),
    ),
  );
  repository.corrections.mockImplementation((ids) =>
    Promise.resolve(
      state.corrections.filter((correction) =>
        ids.includes(correction.recordLineId),
      ),
    ),
  );
  repository.eventByCommand.mockImplementation((id, key) =>
    Promise.resolve(
      state.events.find(
        (event) => event.recordId === id && event.idempotencyKey === key,
      ) ?? null,
    ),
  );
  repository.create.mockImplementation((values) => {
    const record = mock<PurchaseRecord>({
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...values,
    });
    state.records.push(record);
    return Promise.resolve(record);
  });
  repository.createLines.mockImplementation((values) => {
    const lines = values.map((value) =>
      mock<PurchaseRecordLine>({ id: randomUUID(), ...value }),
    );
    state.lines.push(...lines);
    return Promise.resolve(lines);
  });
  repository.createEvent.mockImplementation((values) => {
    const event = mock<PurchaseRecordEvent>({
      id: randomUUID(),
      createdAt: new Date(),
      ...values,
    });
    state.events.push(event);
    return Promise.resolve(event);
  });
  repository.createCorrections.mockImplementation((values) => {
    const corrections = values.map((value) =>
      mock<PurchaseRecordCorrection>({
        id: randomUUID(),
        createdAt: new Date(),
        ...value,
      }),
    );
    state.corrections.push(...corrections);
    return Promise.resolve(corrections);
  });
  repository.update.mockImplementation((record, values) => {
    Object.assign(record, values);
    return Promise.resolve(record);
  });

  const boqLine = mock<IProjectBoqLine>({
    id: boqLineId,
    sourceKey: 'material:one',
    requiredQuantity: '10',
    reviewState: 'confirmed',
    materialId: randomUUID(),
    materialName: 'צינור',
    materialUnit: 'm',
    materialCategory: 'צנרת',
  });
  const boq = mock<ProjectBoqService>();
  boq.get.mockResolvedValue(
    mock<IProjectBoqView>({ projectId, revision: 1, lines: [boqLine] }),
  );
  const transaction = mock<Transaction>();
  const transactions = mock<DatabaseTransactionService>();
  transactions.lockKey.mockResolvedValue();
  transactions.run.mockImplementation((work) => work(transaction));
  return {
    state,
    repository,
    boq,
    transactions,
    service: new PurchaseRecordService(repository, boq, transactions),
  };
};

describe('PurchaseRecordService', () => {
  it('holds a partial request and rejects a second claim beyond the balance', async () => {
    const { service } = setup();
    await service.request(projectId, input('7'), fullUser);
    await expect(
      service.request(projectId, input('7'), fullUser),
    ).rejects.toBeInstanceOf(ConflictException);
    const workspace = await service.workspace(projectId);
    expect(workspace.lines[0].requestedQuantity).toBe('7.00000000');
    expect(workspace.lines[0].remainingQuantity).toBe('3.00000000');
  });

  it('replays the same command without adding a second order', async () => {
    const { service, state } = setup();
    const command = input('4');
    await service.recordOrder(projectId, command, fullUser);
    await service.recordOrder(projectId, command, fullUser);
    expect(state.records).toHaveLength(1);
    expect((await service.workspace(projectId)).lines[0].orderedQuantity).toBe(
      '4.00000000',
    );
    await expect(
      service.recordOrder(
        projectId,
        input('5', command.idempotencyKey),
        fullUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires manager approval with a reason for an over-plan order', async () => {
    const { service } = setup();
    await expect(
      service.request(projectId, input('12'), restrictedUser),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.request(
        projectId,
        input('12', randomUUID(), 'נדרש באתר'),
        restrictedUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const workspace = await service.recordOrder(
      projectId,
      input('12', randomUUID(), 'נדרש באתר'),
      fullUser,
    );
    expect(workspace.lines[0].overrunQuantity).toBe('2.00000000');
  });

  it('walks a held request into a recorded order and replays the transition', async () => {
    const { service } = setup();
    const requested = await service.request(projectId, input('4'), fullUser);
    const recordId = requested.history[0].id;
    const stages = ['reviewed', 'approved', 'ordered'];
    for (const status of stages) {
      const command = { status, reason: '', idempotencyKey: randomUUID() };
      await service.transition(projectId, recordId, command, fullUser);
      await service.transition(projectId, recordId, command, fullUser);
    }
    const workspace = await service.workspace(projectId);
    expect(workspace.lines[0].requestedQuantity).toBe('0.00000000');
    expect(workspace.lines[0].orderedQuantity).toBe('4.00000000');
    expect(workspace.history[0].events).toHaveLength(4);
  });

  it('rejects an invalid status jump and denies ordered cancellation to review-only users', async () => {
    const { service } = setup();
    const requested = await service.request(projectId, input('4'), fullUser);
    const recordId = requested.history[0].id;
    await expect(
      service.transition(
        projectId,
        recordId,
        { status: 'ordered', reason: '', idempotencyKey: randomUUID() },
        fullUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await service.transition(
      projectId,
      recordId,
      { status: 'reviewed', reason: '', idempotencyKey: randomUUID() },
      fullUser,
    );
    await service.transition(
      projectId,
      recordId,
      { status: 'approved', reason: '', idempotencyKey: randomUUID() },
      fullUser,
    );
    await service.transition(
      projectId,
      recordId,
      { status: 'ordered', reason: '', idempotencyKey: randomUUID() },
      fullUser,
    );
    await expect(
      service.transition(
        projectId,
        recordId,
        { status: 'cancelled', reason: 'טעות', idempotencyKey: randomUUID() },
        restrictedUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('releases a cancelled request and preserves its history', async () => {
    const { service } = setup();
    const requested = await service.request(projectId, input('6'), fullUser);
    const workspace = await service.transition(
      projectId,
      requested.history[0].id,
      { status: 'cancelled', reason: 'טעות', idempotencyKey: randomUUID() },
      fullUser,
    );
    expect(workspace.lines[0].remainingQuantity).toBe('10.00000000');
    expect(workspace.history[0].status).toBe('cancelled');
    expect(workspace.history[0].events).toHaveLength(2);
  });

  it('corrects an ordered check without deleting order history', async () => {
    const { service } = setup();
    await service.recordOrder(projectId, input('5'), fullUser);
    const workspace = await service.correctOrderedLine(
      projectId,
      boqLineId,
      { reason: 'תיקון', idempotencyKey: randomUUID() },
      fullUser,
    );
    expect(workspace.lines[0].ordered).toBe(false);
    expect(workspace.lines[0].remainingQuantity).toBe('10.00000000');
    expect(workspace.history[0].lines[0].quantity).toBe('5.00000000');
    expect(workspace.history[0].lines[0].activeQuantity).toBe('0.00000000');
  });

  it('denies recording and correction without purchase approval permission', async () => {
    const { service } = setup();
    await expect(
      service.recordOrder(projectId, input('1'), restrictedUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.correctOrderedLine(
        projectId,
        boqLineId,
        { reason: 'תיקון', idempotencyKey: randomUUID() },
        restrictedUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('pages history while retaining balances from all active records', async () => {
    const { service, state } = setup();
    await service.request(projectId, input('1'), fullUser);
    state.records.push(
      ...Array.from({ length: 50 }, (_, index) =>
        mock<PurchaseRecord>({
          id: randomUUID(),
          projectId,
          status: 'cancelled',
          createdAt: new Date(Date.UTC(2026, 10, 17, 12, index)),
          updatedAt: new Date(),
        }),
      ),
    );
    const workspace = await service.workspace(projectId);
    expect(workspace.history).toHaveLength(50);
    expect(workspace.nextCursor).toContain('|');
    expect(workspace.lines[0].requestedQuantity).toBe('1.00000000');
  });
});
