import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import {
  PURCHASE_CURRENCY,
  PURCHASE_RECORD_ACTION,
  PURCHASE_RECORD_STATUS,
} from './constants/purchase-record.constant';

import type {
  IPurchaseHistory,
  IPurchaseWorkspace,
} from './interfaces/purchase-record.interface';

import Decimal from 'decimal.js';
import { createHash } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { PROJECT_BOQ_REVIEW } from '@Modules/project-boq/constants';
import { PurchaseRecordRepository } from './purchase-record.repository';
import type { PurchaseRecord } from './entities/purchase-record.entity';
import { ProjectBoqService } from '@Modules/project-boq/project-boq.service';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import type { CreatePurchaseRecordDto } from './dto/create-purchase-record.dto';
import type { PurchaseHistoryQueryDto } from './dto/purchase-history-query.dto';
import type { PurchaseRecordLine } from './entities/purchase-record-line.entity';
import type { CorrectPurchaseRecordDto } from './dto/correct-purchase-record.dto';
import type { PurchaseRecordEvent } from './entities/purchase-record-event.entity';
import type { TransitionPurchaseRecordDto } from './dto/transition-purchase-record.dto';
import type { PurchaseOrderLineTerm } from './entities/purchase-order-line-term.entity';
import type { PurchaseRecordCorrection } from './entities/purchase-record-correction.entity';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { SupplierAgreementService } from '@Modules/supplier-agreement/supplier-agreement.service';

type TPurchaseStatus =
  (typeof PURCHASE_RECORD_STATUS)[keyof typeof PURCHASE_RECORD_STATUS];

interface ILedger {
  records: PurchaseRecord[];
  lines: PurchaseRecordLine[];
  events: PurchaseRecordEvent[];
  orderTerms: PurchaseOrderLineTerm[];
  corrections: PurchaseRecordCorrection[];
}

@Injectable()
export class PurchaseRecordService {
  constructor(
    private readonly repository: PurchaseRecordRepository,
    private readonly boq: ProjectBoqService,
    private readonly supplierAgreements: SupplierAgreementService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  async workspace(
    projectId: string,
    query: PurchaseHistoryQueryDto = {},
  ): Promise<IPurchaseWorkspace> {
    const cursor = this.parseHistoryCursor(query.cursor ?? null);
    const [boq, ledger, historyRows] = await Promise.all([
      this.boq.get(projectId),
      this.ledger(projectId),
      this.repository.historyPage(projectId, query.search ?? '', cursor),
    ]);
    this.ensureActiveUnitsMatch(boq.lines, ledger);
    const activeBySource = this.activeQuantities(ledger);
    const page = historyRows.slice(0, 50);
    const historyLedger = await this.ledgerForRecords(page);
    const lastRecord = page.at(-1);
    return {
      projectId,
      revision: boq.revision,
      lines: boq.lines.map((line) => {
        const active = activeBySource.get(line.sourceKey) ?? {
          requested: new Decimal(0),
          ordered: new Decimal(0),
        };
        const required =
          line.requiredQuantity === null
            ? null
            : new Decimal(line.requiredQuantity);
        const used = active.requested.plus(active.ordered);
        const available = required?.minus(used) ?? null;
        return {
          ...line,
          ordered: active.ordered.gt(0),
          requestedQuantity: active.requested.toFixed(8),
          orderedQuantity: active.ordered.toFixed(8),
          remainingQuantity: available?.gt(0)
            ? available.toFixed(8)
            : required === null
              ? null
              : '0',
          overrunQuantity: available?.lt(0)
            ? available.negated().toFixed(8)
            : '0',
        };
      }),
      history: this.history(historyLedger),
      nextCursor:
        historyRows.length > page.length && lastRecord
          ? `${lastRecord.createdAt.toISOString()}|${lastRecord.id}`
          : null,
    };
  }

  createDraft(
    projectId: string,
    input: CreatePurchaseRecordDto,
    user: IAuthorizedUser,
  ): Promise<IPurchaseWorkspace> {
    return this.create(projectId, input, user, PURCHASE_RECORD_STATUS.DRAFT);
  }

  request(
    projectId: string,
    input: CreatePurchaseRecordDto,
    user: IAuthorizedUser,
  ): Promise<IPurchaseWorkspace> {
    return this.create(
      projectId,
      input,
      user,
      PURCHASE_RECORD_STATUS.REQUESTED,
    );
  }

  recordOrder(
    projectId: string,
    input: CreatePurchaseRecordDto,
    user: IAuthorizedUser,
  ): Promise<IPurchaseWorkspace> {
    return this.create(projectId, input, user, PURCHASE_RECORD_STATUS.ORDERED);
  }

  async transition(
    projectId: string,
    recordId: string,
    input: TransitionPurchaseRecordDto,
    user: IAuthorizedUser,
  ): Promise<IPurchaseWorkspace> {
    if (!user.permissions.includes(PERMISSIONS.PURCHASE_REQUESTS_REVIEW)) {
      throw new ForbiddenException('אין הרשאה לשנות מצב רכש');
    }
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          status: input.status,
          reason: input.reason.trim(),
          supplierName: input.supplierName?.trim() ?? null,
          supplierId: input.supplierId ?? null,
          lines: input.lines ?? null,
          orderDate: input.orderDate ?? null,
        }),
      )
      .digest('hex');
    await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(`project-boq:${projectId}`, transaction);
      const record = await this.repository.record(
        recordId,
        projectId,
        transaction,
      );
      if (!record) {
        throw new NotFoundException('בקשת רכש לא נמצאה בפרויקט');
      }
      const previousCommand = await this.repository.eventByCommand(
        recordId,
        input.idempotencyKey,
        transaction,
      );
      if (previousCommand) {
        if (previousCommand.payloadHash !== payloadHash) {
          throw new ConflictException('מפתח הפעולה כבר שימש לפעולה אחרת');
        }
        return;
      }
      const next = input.status as TPurchaseStatus;
      const previousStatus = record.status;
      this.requireTransition(record.status, next, input.reason, user);
      if (
        next !== PURCHASE_RECORD_STATUS.ORDERED &&
        (Reflect.has(input, 'supplierName') ||
          Reflect.has(input, 'orderDate') ||
          Reflect.has(input, 'supplierId') ||
          Reflect.has(input, 'lines'))
      ) {
        throw new BadRequestException(
          'אפשר לעדכן ספק ותאריך רק בעת רישום הזמנה',
        );
      }
      const supplierName = input.supplierName?.trim() || record.supplierName;
      const orderDate = input.orderDate ?? record.orderDate;
      if (
        record.supplierId &&
        input.supplierId &&
        input.supplierId !== record.supplierId
      ) {
        throw new ConflictException(
          'לא ניתן להחליף ספק בבקשה קיימת; יש ליצור בקשה חדשה',
        );
      }
      if (
        record.supplierId &&
        input.supplierName &&
        input.supplierName.trim() !== record.supplierName
      ) {
        throw new ConflictException(
          'לא ניתן להחליף ספק בבקשה קיימת; יש ליצור בקשה חדשה',
        );
      }
      if (
        next === PURCHASE_RECORD_STATUS.ORDERED &&
        (!(supplierName || input.supplierId) || !orderDate)
      ) {
        throw new BadRequestException('יש לציין ספק ותאריך לפני רישום הזמנה');
      }
      const ownLines = await this.repository.lines([recordId], transaction);
      const lateSelection =
        next === PURCHASE_RECORD_STATUS.ORDERED &&
        !record.supplierId &&
        input.supplierId
          ? (input.lines ?? [])
          : [];
      if (
        lateSelection.length > 0 &&
        (lateSelection.length !== ownLines.length ||
          new Set(lateSelection.map((line) => line.recordLineId)).size !==
            ownLines.length ||
          ownLines.some(
            (line) =>
              !lateSelection.some(
                (selected) => selected.recordLineId === line.id,
              ),
          ))
      ) {
        throw new BadRequestException('יש לבחור הסכם לכל שורת בקשה');
      }
      if (
        next === PURCHASE_RECORD_STATUS.ORDERED &&
        !record.supplierId &&
        input.supplierId &&
        lateSelection.length === 0
      ) {
        throw new BadRequestException('יש לבחור הסכם לכל שורת בקשה');
      }
      if (input.lines && lateSelection.length === 0) {
        throw new BadRequestException(
          'אפשר לבחור הסכמים רק בעת רישום הזמנה עם ספק חדש',
        );
      }
      const selectionLines = record.supplierId
        ? ownLines.map((line) => ({
            agreementId: line.supplierAgreementId ?? '',
            agreementVersion: line.supplierAgreementVersion,
            boqSourceKey: line.boqSourceKey,
            materialId: line.materialId,
            materialUnit: line.materialUnit,
            unitCost: line.unitCost,
          }))
        : ownLines.map((line) => {
            const selected = lateSelection.find(
              (item) => item.recordLineId === line.id,
            );
            return {
              agreementId: selected?.agreementId ?? '',
              agreementVersion: selected?.agreementVersion ?? null,
              boqSourceKey: line.boqSourceKey,
              materialId: line.materialId,
              materialUnit: line.materialUnit,
              unitCost: selected?.unitCost ?? null,
            };
          });
      const selection =
        next === PURCHASE_RECORD_STATUS.ORDERED &&
        (record.supplierId || input.supplierId)
          ? await this.supplierAgreements.resolveSelection(
              projectId,
              record.supplierId ?? input.supplierId ?? '',
              selectionLines,
              orderDate,
              transaction,
            )
          : null;
      if (
        selection &&
        record.supplierId &&
        ownLines.some(
          (line) =>
            selection.agreements.get(line.boqSourceKey)?.version !==
            line.supplierAgreementVersion,
        )
      ) {
        throw new ConflictException(
          'הסכם הספק השתנה מאז הבקשה; יש ליצור בקשה חדשה',
        );
      }
      if (selection && lateSelection.length > 0) {
        await this.repository.createOrderTerms(
          ownLines.map((line) => {
            const agreement = selection.agreements.get(line.boqSourceKey);
            if (!agreement) {
              throw new ConflictException('לא נמצא הסכם תואם לשורת בקשה');
            }
            return {
              recordLineId: line.id,
              supplierAgreementId: agreement.id,
              supplierAgreementVersion: agreement.version,
              unitCost: agreement.unitPrice,
              currencyCode: agreement.currencyCode,
              actorId: user.id,
            };
          }),
          transaction,
        );
      }
      if (
        next === PURCHASE_RECORD_STATUS.REQUESTED ||
        next === PURCHASE_RECORD_STATUS.ORDERED
      ) {
        const boq = await this.boq.get(projectId);
        const ledger = await this.ledger(projectId, transaction);
        this.validateAvailability(
          boq.lines,
          ledger,
          ownLines,
          record.status,
          record.exceptionReason,
          user,
        );
      }
      await this.repository.update(
        record,
        {
          status: next,
          supplierId: selection
            ? (record.supplierId ?? input.supplierId ?? null)
            : record.supplierId,
          supplierName: selection?.selectedSupplier.name ?? supplierName,
          supplierContactName: selection
            ? selection.selectedSupplier.contactName
            : record.supplierContactName,
          supplierPhone: selection
            ? selection.selectedSupplier.phone
            : record.supplierPhone,
          supplierEmail: selection
            ? selection.selectedSupplier.email
            : record.supplierEmail,
          orderDate,
          updatedById: user.id,
        },
        transaction,
      );
      await this.repository.createEvent(
        {
          recordId,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
          actorId: user.id,
          action: PURCHASE_RECORD_ACTION.TRANSITION,
          previousStatus,
          nextStatus: next,
          reason: input.reason.trim(),
        },
        transaction,
      );
    });
    return this.workspace(projectId);
  }

  async correctOrderedLine(
    projectId: string,
    boqLineId: string,
    input: CorrectPurchaseRecordDto,
    user: IAuthorizedUser,
  ): Promise<IPurchaseWorkspace> {
    if (!user.permissions.includes(PERMISSIONS.PURCHASE_ORDERS_APPROVE)) {
      throw new ForbiddenException('אין הרשאה לתקן הזמנה');
    }
    if (!input.reason.trim()) {
      throw new BadRequestException('יש לציין סיבה לתיקון');
    }
    await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(`project-boq:${projectId}`, transaction);
      const boq = await this.boq.get(projectId);
      const target = boq.lines.find((line) => line.id === boqLineId);
      if (!target) {
        throw new NotFoundException('שורת חומר לא נמצאה בפרויקט');
      }
      const ledger = await this.ledger(projectId, transaction);
      const previous = ledger.corrections.find(
        (correction) =>
          correction.idempotencyKey === input.idempotencyKey &&
          correction.actorId === user.id,
      );
      if (previous) {
        const previousLine = ledger.lines.find(
          (line) => line.id === previous.recordLineId,
        );
        if (
          previousLine?.boqSourceKey !== target.sourceKey ||
          previous.reason !== input.reason.trim()
        ) {
          throw new ConflictException('מפתח הפעולה כבר שימש לתיקון אחר');
        }
        return;
      }
      const orderedIds = new Set(
        ledger.records
          .filter((record) => record.status === PURCHASE_RECORD_STATUS.ORDERED)
          .map((record) => record.id),
      );
      const corrections = ledger.lines
        .filter(
          (line) =>
            orderedIds.has(line.recordId) &&
            line.boqSourceKey === target.sourceKey,
        )
        .map((line) => ({
          line,
          active: new Decimal(line.quantity).minus(
            this.correctedQuantity(line.id, ledger.corrections),
          ),
        }))
        .filter(({ active }) => active.gt(0));
      if (corrections.length === 0) {
        throw new ConflictException('אין כמות מוזמנת פעילה לתיקון');
      }
      await this.repository.createCorrections(
        corrections.map(({ line, active }) => ({
          recordLineId: line.id,
          idempotencyKey: input.idempotencyKey,
          quantity: active.toFixed(8),
          actorId: user.id,
          reason: input.reason.trim(),
        })),
        transaction,
      );
      for (const recordId of new Set(
        corrections.map(({ line }) => line.recordId),
      )) {
        await this.repository.createEvent(
          {
            recordId,
            idempotencyKey: input.idempotencyKey,
            payloadHash: createHash('sha256')
              .update(
                JSON.stringify({ boqLineId, reason: input.reason.trim() }),
              )
              .digest('hex'),
            actorId: user.id,
            action: PURCHASE_RECORD_ACTION.CORRECT,
            previousStatus: PURCHASE_RECORD_STATUS.ORDERED,
            nextStatus: PURCHASE_RECORD_STATUS.ORDERED,
            reason: input.reason.trim(),
          },
          transaction,
        );
      }
    });
    return this.workspace(projectId);
  }

  private async create(
    projectId: string,
    input: CreatePurchaseRecordDto,
    user: IAuthorizedUser,
    status: TPurchaseStatus,
  ): Promise<IPurchaseWorkspace> {
    const requiredPermission =
      status === PURCHASE_RECORD_STATUS.ORDERED
        ? PERMISSIONS.PURCHASE_ORDERS_APPROVE
        : PERMISSIONS.PURCHASE_REQUESTS_REVIEW;
    if (!user.permissions.includes(requiredPermission)) {
      throw new ForbiddenException('אין הרשאה לפעולת רכש');
    }
    const supplierName = input.supplierName?.trim() || null;
    const supplierId = input.supplierId ?? null;
    const orderDate = input.orderDate ?? null;
    if (
      status === PURCHASE_RECORD_STATUS.ORDERED &&
      (!(supplierName || supplierId) || !orderDate)
    ) {
      throw new BadRequestException('יש לציין ספק ותאריך הזמנה');
    }
    const normalized = {
      status,
      supplierName,
      supplierId,
      orderDate,
      onBehalfOf: input.onBehalfOf?.trim() || null,
      exceptionReason: input.exceptionReason?.trim() || null,
      notes: input.notes?.trim() ?? '',
      lines: [...input.lines].sort((first, second) =>
        first.boqLineId.localeCompare(second.boqLineId),
      ),
    };
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
    await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(`project-boq:${projectId}`, transaction);
      const previous = await this.repository.command(
        projectId,
        user.id,
        input.idempotencyKey,
        transaction,
      );
      if (previous) {
        if (previous.payloadHash !== payloadHash) {
          throw new ConflictException('מפתח הפעולה כבר שימש לבקשה אחרת');
        }
        return;
      }
      const boq = await this.boq.get(projectId);
      if (boq.revision === 0) {
        throw new BadRequestException('יש ליצור כתב רכש לפני בקשה או הזמנה');
      }
      const ledger = await this.ledger(projectId, transaction);
      const lines = normalized.lines.map((inputLine) => {
        const boqLine = boq.lines.find(
          (line) => line.id === inputLine.boqLineId,
        );
        if (
          !boqLine ||
          boqLine.requiredQuantity === null ||
          boqLine.reviewState !== PROJECT_BOQ_REVIEW.CONFIRMED
        ) {
          throw new BadRequestException('יש לאשר כמות נדרשת לכל חומר לפני רכש');
        }
        const quantity = new Decimal(inputLine.quantity);
        if (!quantity.isFinite() || quantity.lte(0)) {
          throw new BadRequestException('כמות הרכש חייבת להיות חיובית');
        }
        return {
          boqLineId: boqLine.id,
          boqSourceKey: boqLine.sourceKey,
          materialId: boqLine.materialId,
          materialName: boqLine.materialName,
          materialUnit: boqLine.materialUnit,
          quantity: quantity.toFixed(8),
          unitCost: inputLine.unitCost ?? null,
          agreementId: inputLine.agreementId ?? null,
          agreementVersion: inputLine.agreementVersion ?? null,
          currencyCode: PURCHASE_CURRENCY.ILS,
        };
      });
      if (
        new Set(lines.map((line) => line.boqSourceKey)).size !== lines.length
      ) {
        throw new BadRequestException('אותו חומר מופיע פעמיים באותה פעולה');
      }
      if (status !== PURCHASE_RECORD_STATUS.DRAFT) {
        this.validateAvailability(
          boq.lines,
          ledger,
          lines,
          PURCHASE_RECORD_STATUS.DRAFT,
          normalized.exceptionReason,
          user,
        );
      }
      if (
        supplierId &&
        lines.some(
          (line) =>
            !line.agreementId || !line.agreementVersion || !line.unitCost,
        )
      ) {
        throw new BadRequestException('יש לבחור הסכם מתאים לכל חומר');
      }
      if (!supplierId && lines.some((line) => line.agreementId)) {
        throw new BadRequestException('יש לבחור ספק עבור ההסכמים');
      }
      const selection = supplierId
        ? await this.supplierAgreements.resolveSelection(
            projectId,
            supplierId,
            lines.map((line) => ({
              agreementId: line.agreementId ?? '',
              agreementVersion: line.agreementVersion,
              boqSourceKey: line.boqSourceKey,
              materialId: line.materialId,
              materialUnit: line.materialUnit,
              unitCost: line.unitCost,
            })),
            orderDate,
            transaction,
          )
        : null;
      if (
        selection &&
        supplierName &&
        supplierName !== selection.selectedSupplier.name
      ) {
        throw new ConflictException('שם הספק אינו תואם לספק שנבחר');
      }
      const purchaseLines = lines.map((line) => {
        const agreement = selection?.agreements.get(line.boqSourceKey);
        return {
          ...line,
          unitCost: agreement?.unitPrice ?? line.unitCost,
          currencyCode: agreement?.currencyCode ?? line.currencyCode,
          supplierAgreementId: agreement?.id ?? null,
          supplierAgreementVersion: agreement?.version ?? null,
        };
      });
      const record = await this.repository.create(
        {
          projectId,
          status,
          supplierName: selection?.selectedSupplier.name ?? supplierName,
          supplierId,
          supplierContactName: selection?.selectedSupplier.contactName ?? null,
          supplierPhone: selection?.selectedSupplier.phone ?? null,
          supplierEmail: selection?.selectedSupplier.email ?? null,
          orderDate,
          onBehalfOf: normalized.onBehalfOf,
          exceptionReason: normalized.exceptionReason,
          notes: normalized.notes,
          materialSearch: purchaseLines
            .map((line) => line.materialName)
            .join(' '),
          createdById: user.id,
          updatedById: user.id,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
        },
        transaction,
      );
      await this.repository.createLines(
        purchaseLines.map((line) => ({ ...line, recordId: record.id })),
        transaction,
      );
      await this.repository.createEvent(
        {
          recordId: record.id,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
          actorId: user.id,
          action: PURCHASE_RECORD_ACTION.CREATE,
          previousStatus: null,
          nextStatus: status,
          reason: normalized.exceptionReason ?? '',
        },
        transaction,
      );
    });
    return this.workspace(projectId);
  }

  private async ledger(
    projectId: string,
    transaction?: Transaction,
  ): Promise<ILedger> {
    const records = await this.repository.records(projectId, transaction);
    return this.ledgerForRecords(records, transaction, false);
  }

  private async ledgerForRecords(
    records: PurchaseRecord[],
    transaction?: Transaction,
    includeEvents = true,
  ): Promise<ILedger> {
    const recordIds = records.map((record) => record.id);
    const [lines, events] = await Promise.all([
      this.repository.lines(recordIds, transaction),
      includeEvents
        ? this.repository.events(recordIds, transaction)
        : Promise.resolve([]),
    ]);
    const [corrections, orderTerms] = await Promise.all([
      this.repository.corrections(
        lines.map((line) => line.id),
        transaction,
      ),
      this.repository.orderTerms(
        lines.map((line) => line.id),
        transaction,
      ),
    ]);
    return { records, lines, events, corrections, orderTerms };
  }

  private parseHistoryCursor(
    value: string | null,
  ): { createdAt: Date; id: string } | null {
    if (value === null) {
      return null;
    }
    const [timestamp, id] = value.split('|');
    const createdAt = new Date(timestamp);
    if (!id || Number.isNaN(createdAt.getTime())) {
      throw new BadRequestException('סמן דפדוף היסטוריה אינו תקין');
    }
    return { createdAt, id };
  }

  private correctedQuantity(
    lineId: string,
    corrections: PurchaseRecordCorrection[],
  ): Decimal {
    return corrections
      .filter((correction) => correction.recordLineId === lineId)
      .reduce(
        (sum, correction) => sum.plus(correction.quantity),
        new Decimal(0),
      );
  }

  private ensureActiveUnitsMatch(
    boqLines: { sourceKey: string; materialUnit: string }[],
    ledger: ILedger,
  ): void {
    const currentUnits = new Map(
      boqLines.map((line) => [line.sourceKey, line.materialUnit]),
    );
    const activeRecords = new Set(
      ledger.records
        .filter(
          (record) =>
            record.status !== PURCHASE_RECORD_STATUS.DRAFT &&
            record.status !== PURCHASE_RECORD_STATUS.CANCELLED,
        )
        .map((record) => record.id),
    );
    for (const line of ledger.lines) {
      const activeQuantity = new Decimal(line.quantity).minus(
        this.correctedQuantity(line.id, ledger.corrections),
      );
      if (
        activeRecords.has(line.recordId) &&
        activeQuantity.gt(0) &&
        currentUnits.get(line.boqSourceKey) !== line.materialUnit
      ) {
        throw new ConflictException(
          'יחידת חומר ביומן הרכש שונה מכתב הרכש; יש לתקן את הרישום לפני רכישה נוספת',
        );
      }
    }
  }

  private activeQuantities(
    ledger: ILedger,
  ): Map<string, { requested: Decimal; ordered: Decimal }> {
    const records = new Map(
      ledger.records.map((record) => [record.id, record]),
    );
    return ledger.lines.reduce((totals, line) => {
      const status = records.get(line.recordId)?.status;
      if (
        !status ||
        status === PURCHASE_RECORD_STATUS.DRAFT ||
        status === PURCHASE_RECORD_STATUS.CANCELLED
      ) {
        return totals;
      }
      const current = totals.get(line.boqSourceKey) ?? {
        requested: new Decimal(0),
        ordered: new Decimal(0),
      };
      const active = new Decimal(line.quantity).minus(
        this.correctedQuantity(line.id, ledger.corrections),
      );
      const next =
        status === PURCHASE_RECORD_STATUS.ORDERED
          ? { ...current, ordered: current.ordered.plus(active) }
          : { ...current, requested: current.requested.plus(active) };
      totals.set(line.boqSourceKey, next);
      return totals;
    }, new Map<string, { requested: Decimal; ordered: Decimal }>());
  }

  private validateAvailability(
    boqLines: {
      sourceKey: string;
      materialUnit: string;
      requiredQuantity: string | null;
    }[],
    ledger: ILedger,
    lines: { boqSourceKey: string; quantity: string }[],
    previousStatus: string,
    exceptionReason: string | null,
    user: IAuthorizedUser,
  ): void {
    this.ensureActiveUnitsMatch(boqLines, ledger);
    const active = this.activeQuantities(ledger);
    for (const line of lines) {
      const required = boqLines.find(
        (item) => item.sourceKey === line.boqSourceKey,
      )?.requiredQuantity;
      if (required == null) {
        throw new BadRequestException('כמות נדרשת חסרה');
      }
      const existing = active.get(line.boqSourceKey) ?? {
        requested: new Decimal(0),
        ordered: new Decimal(0),
      };
      const alreadyHeld =
        previousStatus === PURCHASE_RECORD_STATUS.DRAFT
          ? new Decimal(0)
          : new Decimal(line.quantity);
      const total = existing.requested
        .plus(existing.ordered)
        .minus(alreadyHeld)
        .plus(line.quantity);
      if (total.lte(required)) {
        continue;
      }
      if (
        !exceptionReason?.trim() ||
        !user.permissions.includes(PERMISSIONS.PURCHASE_ORDERS_APPROVE)
      ) {
        throw new ConflictException(
          'הכמות חורגת מהנדרש; נדרש נימוק ואישור מנהל רכש',
        );
      }
    }
  }

  private requireTransition(
    current: string,
    next: TPurchaseStatus,
    reason: string,
    user: IAuthorizedUser,
  ): void {
    const allowed: Record<string, string[]> = {
      [PURCHASE_RECORD_STATUS.DRAFT]: [
        PURCHASE_RECORD_STATUS.REQUESTED,
        PURCHASE_RECORD_STATUS.CANCELLED,
      ],
      [PURCHASE_RECORD_STATUS.REQUESTED]: [
        PURCHASE_RECORD_STATUS.REVIEWED,
        PURCHASE_RECORD_STATUS.CANCELLED,
      ],
      [PURCHASE_RECORD_STATUS.REVIEWED]: [
        PURCHASE_RECORD_STATUS.APPROVED,
        PURCHASE_RECORD_STATUS.CANCELLED,
      ],
      [PURCHASE_RECORD_STATUS.APPROVED]: [
        PURCHASE_RECORD_STATUS.ORDERED,
        PURCHASE_RECORD_STATUS.CANCELLED,
      ],
      [PURCHASE_RECORD_STATUS.ORDERED]: [PURCHASE_RECORD_STATUS.CANCELLED],
      [PURCHASE_RECORD_STATUS.CANCELLED]: [],
    };
    if (!allowed[current]?.includes(next)) {
      throw new ConflictException('מעבר מצב רכש אינו מותר');
    }
    if (next === PURCHASE_RECORD_STATUS.CANCELLED && !reason.trim()) {
      throw new BadRequestException('יש לציין סיבה לביטול');
    }
    const cancellingApprovedOrder =
      next === PURCHASE_RECORD_STATUS.CANCELLED &&
      (current === PURCHASE_RECORD_STATUS.APPROVED ||
        current === PURCHASE_RECORD_STATUS.ORDERED);
    const needsApproval =
      cancellingApprovedOrder ||
      next === PURCHASE_RECORD_STATUS.APPROVED ||
      next === PURCHASE_RECORD_STATUS.ORDERED;
    if (
      needsApproval &&
      !user.permissions.includes(PERMISSIONS.PURCHASE_ORDERS_APPROVE)
    ) {
      throw new ForbiddenException('אין הרשאה לאשר או לרשום הזמנה');
    }
  }

  private history(ledger: ILedger): IPurchaseHistory[] {
    return ledger.records.map((record) => ({
      id: record.id,
      status: record.status,
      notes: record.notes,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      createdById: record.createdById,
      updatedById: record.updatedById,
      orderDate: record.orderDate,
      onBehalfOf: record.onBehalfOf,
      supplierName: record.supplierName,
      supplierId: record.supplierId,
      supplierContactName: record.supplierContactName,
      supplierPhone: record.supplierPhone,
      supplierEmail: record.supplierEmail,
      exceptionReason: record.exceptionReason,
      lines: ledger.lines
        .filter((line) => line.recordId === record.id)
        .map((line) => ({
          materialId: line.materialId,
          id: line.id,
          quantity: line.quantity,
          activeQuantity:
            record.status === PURCHASE_RECORD_STATUS.CANCELLED
              ? '0'
              : new Decimal(line.quantity)
                  .minus(this.correctedQuantity(line.id, ledger.corrections))
                  .toFixed(8),
          materialName: line.materialName,
          materialUnit: line.materialUnit,
          boqSourceKey: line.boqSourceKey,
          unitCost:
            ledger.orderTerms.find((term) => term.recordLineId === line.id)
              ?.unitCost ?? line.unitCost,
          currencyCode:
            ledger.orderTerms.find((term) => term.recordLineId === line.id)
              ?.currencyCode ?? line.currencyCode,
          supplierAgreementId:
            ledger.orderTerms.find((term) => term.recordLineId === line.id)
              ?.supplierAgreementId ?? line.supplierAgreementId,
          supplierAgreementVersion:
            ledger.orderTerms.find((term) => term.recordLineId === line.id)
              ?.supplierAgreementVersion ?? line.supplierAgreementVersion,
        })),
      events: ledger.events
        .filter((event) => event.recordId === record.id)
        .map((event) => ({
          id: event.id,
          action: event.action,
          actorId: event.actorId,
          reason: event.reason,
          nextStatus: event.nextStatus,
          previousStatus: event.previousStatus,
          createdAt: event.createdAt,
        })),
    }));
  }
}
