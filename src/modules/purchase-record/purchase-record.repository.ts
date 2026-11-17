import { Injectable } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { PurchaseRecord } from './entities/purchase-record.entity';
import { PurchaseRecordLine } from './entities/purchase-record-line.entity';
import { PurchaseRecordEvent } from './entities/purchase-record-event.entity';
import { PURCHASE_RECORD_STATUS } from './constants/purchase-record.constant';
import { PurchaseRecordCorrection } from './entities/purchase-record-correction.entity';

@Injectable()
export class PurchaseRecordRepository {
  historyPage(
    projectId: string,
    search: string,
    cursor: { createdAt: Date; id: string } | null,
    transaction?: Transaction,
  ): Promise<PurchaseRecord[]> {
    const searchTerm = search.trim();
    const searchWhere = searchTerm
      ? {
          [Op.or]: [
            { supplierName: { [Op.iLike]: `%${searchTerm}%` } },
            { onBehalfOf: { [Op.iLike]: `%${searchTerm}%` } },
            { notes: { [Op.iLike]: `%${searchTerm}%` } },
            { materialSearch: { [Op.iLike]: `%${searchTerm}%` } },
          ],
        }
      : {};
    const cursorWhere = cursor
      ? {
          [Op.or]: [
            { createdAt: { [Op.lt]: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { [Op.lt]: cursor.id } },
          ],
        }
      : {};
    return PurchaseRecord.findAll({
      where: { projectId, [Op.and]: [searchWhere, cursorWhere] },
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: 51,
      transaction,
    });
  }

  records(
    projectId: string,
    transaction?: Transaction,
  ): Promise<PurchaseRecord[]> {
    return PurchaseRecord.findAll({
      where: {
        projectId,
        status: {
          [Op.in]: [
            PURCHASE_RECORD_STATUS.REQUESTED,
            PURCHASE_RECORD_STATUS.REVIEWED,
            PURCHASE_RECORD_STATUS.APPROVED,
            PURCHASE_RECORD_STATUS.ORDERED,
          ],
        },
      },
      order: [['createdAt', 'DESC']],
      transaction,
    });
  }

  record(
    id: string,
    projectId: string,
    transaction?: Transaction,
  ): Promise<PurchaseRecord | null> {
    return PurchaseRecord.findOne({ where: { id, projectId }, transaction });
  }

  command(
    projectId: string,
    actorId: string,
    key: string,
    transaction?: Transaction,
  ): Promise<PurchaseRecord | null> {
    return PurchaseRecord.findOne({
      where: { projectId, createdById: actorId, idempotencyKey: key },
      transaction,
    });
  }

  lines(
    recordIds: string[],
    transaction?: Transaction,
  ): Promise<PurchaseRecordLine[]> {
    if (recordIds.length === 0) {
      return Promise.resolve([]);
    }
    return PurchaseRecordLine.findAll({
      where: { recordId: { [Op.in]: recordIds } },
      transaction,
    });
  }

  events(
    recordIds: string[],
    transaction?: Transaction,
  ): Promise<PurchaseRecordEvent[]> {
    if (recordIds.length === 0) {
      return Promise.resolve([]);
    }
    return PurchaseRecordEvent.findAll({
      where: { recordId: { [Op.in]: recordIds } },
      order: [['createdAt', 'ASC']],
      transaction,
    });
  }

  corrections(
    lineIds: string[],
    transaction?: Transaction,
  ): Promise<PurchaseRecordCorrection[]> {
    if (lineIds.length === 0) {
      return Promise.resolve([]);
    }
    return PurchaseRecordCorrection.findAll({
      where: { recordLineId: { [Op.in]: lineIds } },
      order: [['createdAt', 'ASC']],
      transaction,
    });
  }

  eventByCommand(
    recordId: string,
    key: string,
    transaction?: Transaction,
  ): Promise<PurchaseRecordEvent | null> {
    return PurchaseRecordEvent.findOne({
      where: { recordId, idempotencyKey: key },
      transaction,
    });
  }

  create(
    values: Partial<PurchaseRecord>,
    transaction: Transaction,
  ): Promise<PurchaseRecord> {
    return PurchaseRecord.create(values, { transaction });
  }

  createLines(
    values: Partial<PurchaseRecordLine>[],
    transaction: Transaction,
  ): Promise<PurchaseRecordLine[]> {
    return PurchaseRecordLine.bulkCreate(values, { transaction });
  }

  createEvent(
    values: Partial<PurchaseRecordEvent>,
    transaction: Transaction,
  ): Promise<PurchaseRecordEvent> {
    return PurchaseRecordEvent.create(values, { transaction });
  }

  createCorrections(
    values: Partial<PurchaseRecordCorrection>[],
    transaction: Transaction,
  ): Promise<PurchaseRecordCorrection[]> {
    return PurchaseRecordCorrection.bulkCreate(values, { transaction });
  }

  update(
    record: PurchaseRecord,
    values: Partial<PurchaseRecord>,
    transaction: Transaction,
  ): Promise<PurchaseRecord> {
    return record.update(values, { transaction });
  }
}
