import { Injectable } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { ProjectBoq } from './entities/project-boq.entity';
import { ProjectBoqLine } from './entities/project-boq-line.entity';
import { Quotation } from '@Modules/quotation/entities/quotation.entity';
import { ProjectBoqRevision } from './entities/project-boq-revision.entity';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';
import { QuotationProject } from '@Modules/quotation-project/entities/quotation-project.entity';

@Injectable()
export class ProjectBoqRepository {
  find(
    projectId: string,
    transaction?: Transaction,
  ): Promise<ProjectBoq | null> {
    return ProjectBoq.findOne({
      where: { projectId },
      transaction,
      lock: transaction?.LOCK.UPDATE,
    });
  }
  lines(boqId: string, transaction?: Transaction): Promise<ProjectBoqLine[]> {
    return ProjectBoqLine.findAll({
      where: { boqId },
      order: [['displayOrder', 'ASC']],
      transaction,
    });
  }
  async sources(projectId: string): Promise<Quotation[]> {
    const links = await QuotationProject.findAll({
      where: { projectId, isPrimary: true },
    });
    return Quotation.findAll({
      where: {
        id: { [Op.in]: links.map((link) => link.quotationId) },
        status: QUOTATION_STATUS.APPROVED,
      },
      order: [['number', 'DESC']],
    });
  }
  create(
    projectId: string,
    actorId: string,
    transaction: Transaction,
  ): Promise<ProjectBoq> {
    return ProjectBoq.create(
      {
        projectId,
        createdById: actorId,
        updatedById: actorId,
        revision: 0,
        sourceQuotationId: null,
        sourceQuotationVersion: null,
      },
      { transaction },
    );
  }
  update(
    boq: ProjectBoq,
    values: Partial<ProjectBoq>,
    transaction: Transaction,
  ): Promise<ProjectBoq> {
    return boq.update(values, { transaction });
  }
  async replaceLines(
    boqId: string,
    lines: object[],
    transaction: Transaction,
  ): Promise<void> {
    await ProjectBoqLine.destroy({ where: { boqId }, transaction });
    await ProjectBoqLine.bulkCreate(
      lines.map((line) => ({ ...line, boqId })),
      { transaction },
    );
  }
  updateLine(
    line: ProjectBoqLine,
    values: Partial<ProjectBoqLine>,
    transaction: Transaction,
  ): Promise<ProjectBoqLine> {
    return line.update(values, { transaction });
  }
  addLine(
    values: Parameters<typeof ProjectBoqLine.create>[0],
    transaction: Transaction,
  ): Promise<ProjectBoqLine> {
    return ProjectBoqLine.create(values, { transaction });
  }
  revision(
    boqId: string,
    revision: number,
  ): Promise<ProjectBoqRevision | null> {
    return ProjectBoqRevision.findOne({ where: { boqId, revision } });
  }
  recordRevision(
    boq: ProjectBoq,
    lines: ProjectBoqLine[],
    actorId: string,
    transaction: Transaction,
  ): Promise<ProjectBoqRevision> {
    return ProjectBoqRevision.create(
      {
        boqId: boq.id,
        revision: boq.revision,
        sourceQuotationId: boq.sourceQuotationId,
        sourceQuotationVersion: boq.sourceQuotationVersion,
        lines: lines.map((line) => ({
          id: line.id,
          materialId: line.materialId,
          sourceKey: line.sourceKey,
          systemTitle: line.systemTitle,
          componentTitle: line.componentTitle,
          materialCode: line.materialCode,
          materialName: line.materialName,
          materialCategory: line.materialCategory,
          materialSpecification: line.materialSpecification,
          materialUnit: line.materialUnit,
          sourceBasis: line.sourceBasis,
          proposedQuantity: line.proposedQuantity,
          requiredQuantity: line.requiredQuantity,
          quantityOverridden: line.quantityOverridden,
          estimatedUnitCost: line.estimatedUnitCost,
          reviewState: line.reviewState,
          notes: line.notes,
          sourceSnapshot: line.sourceSnapshot,
          displayOrder: line.displayOrder,
        })),
        createdById: actorId,
      },
      { transaction },
    );
  }
}
