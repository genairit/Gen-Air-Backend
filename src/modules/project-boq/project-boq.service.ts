import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import type {
  AddProjectBoqLineDto,
  GenerateProjectBoqDto,
  UpdateProjectBoqLineDto,
} from './dto/project-boq.dto';

import type {
  IProjectBoqLine,
  IProjectBoqView,
  IProjectBoqPreview,
} from './interfaces/project-boq.interface';

import {
  MATERIAL_BASIS,
  MATERIAL_STATUS,
} from '@Modules/material/constants/material.constant';

import Decimal from 'decimal.js';
import { createHash, randomUUID } from 'node:crypto';
import { ProjectBoqRepository } from './project-boq.repository';
import type { ProjectBoq } from './entities/project-boq.entity';
import { ProjectService } from '@Modules/project/project.service';
import { PROJECT_BOQ_BASIS, PROJECT_BOQ_REVIEW } from './constants';
import { MaterialService } from '@Modules/material/material.service';
import { QuotationService } from '@Modules/quotation/quotation.service';
import type { ProjectBoqLine } from './entities/project-boq-line.entity';
import type { MaterialQueryDto } from '@Modules/material/dto/material.dto';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';
import { CatalogueMaterialService } from '@Modules/material/catalogue-material.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import type { IQuotationDocument } from '@Modules/quotation/interfaces/quotation-document.interface';

type IProposedLine = Omit<
  IProjectBoqLine,
  | 'estimatedLineCost'
  | 'requestedQuantity'
  | 'orderedQuantity'
  | 'remainingQuantity'
>;
interface IProposal {
  fingerprint: string;
  includedCount: number;
  lines: IProposedLine[];
  quotation: IQuotationDocument;
  unmappedCatalogueItems: string[];
}

@Injectable()
export class ProjectBoqService {
  constructor(
    private readonly repository: ProjectBoqRepository,
    private readonly projects: ProjectService,
    private readonly quotations: QuotationService,
    private readonly materials: MaterialService,
    private readonly breakdowns: CatalogueMaterialService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  materialsSearch(
    query: MaterialQueryDto,
  ): ReturnType<MaterialService['search']> {
    return this.materials.search({ ...query, status: MATERIAL_STATUS.ACTIVE });
  }

  async sources(
    projectId: string,
  ): Promise<{ id: string; number: string; version: number }[]> {
    await this.projects.getById(projectId);
    const quotations = await this.repository.sources(projectId);
    return quotations.map((quotation) => ({
      id: quotation.id,
      number: quotation.number,
      version: quotation.version,
    }));
  }

  async get(projectId: string): Promise<IProjectBoqView> {
    await this.projects.getById(projectId);
    const boq = await this.repository.find(projectId);
    if (!boq) {
      return this.view(projectId, null, [], null);
    }
    const lines = await this.repository.lines(boq.id);
    const quotation = boq.sourceQuotationId
      ? await this.quotations.document(boq.sourceQuotationId)
      : null;
    return this.view(projectId, boq, lines, quotation?.number ?? null);
  }

  async preview(
    projectId: string,
    quotationId: string,
  ): Promise<IProjectBoqPreview> {
    await this.projects.getById(projectId);
    const current = await this.repository.find(projectId);
    const existing = current ? await this.repository.lines(current.id) : [];
    const proposal = await this.proposal(projectId, quotationId, existing);
    const existingByKey = new Map(
      existing
        .filter((line) => line.sourceBasis !== PROJECT_BOQ_BASIS.MANUAL)
        .map((line) => [line.sourceKey, line]),
    );
    const proposedByKey = new Map(
      proposal.lines.map((line) => [line.sourceKey, line]),
    );
    const added = proposal.lines
      .filter((line) => !existingByKey.has(line.sourceKey))
      .map((line) => line.sourceKey);
    const changed = proposal.lines
      .filter((line) => {
        const previous = existingByKey.get(line.sourceKey);
        if (!previous) return false;
        return (
          JSON.stringify(this.comparable(previous)) !==
          JSON.stringify(this.comparable(line))
        );
      })
      .map((line) => line.sourceKey);
    const removed = [...existingByKey.keys()].filter(
      (key) => !proposedByKey.has(key),
    );
    return {
      quotationId,
      quotationVersion: proposal.quotation.version,
      quotationNumber: proposal.quotation.number,
      fingerprint: proposal.fingerprint,
      lines: proposal.lines.map((line) => this.lineView(line)),
      added,
      changed,
      removed,
      unmappedCatalogueItems: proposal.unmappedCatalogueItems,
      includedCount: proposal.includedCount,
    };
  }

  async generate(
    projectId: string,
    input: GenerateProjectBoqDto,
    actorId: string,
  ): Promise<IProjectBoqView> {
    await this.projects.getById(projectId);
    await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(`project-boq:${projectId}`, transaction);
      const current = await this.repository.find(projectId, transaction);
      if ((current?.revision ?? 0) !== input.expectedRevision) {
        throw new ConflictException('כתב הרכש השתנה; יש לטעון מחדש');
      }
      const existing = current
        ? await this.repository.lines(current.id, transaction)
        : [];
      const proposal = await this.proposal(
        projectId,
        input.quotationId,
        existing,
      );
      if (
        proposal.quotation.version !== input.quotationVersion ||
        proposal.fingerprint !== input.previewFingerprint
      ) {
        throw new ConflictException(
          'הצעת המחיר או פירוט החומרים השתנו; יש לבדוק שוב את התצוגה',
        );
      }
      const boq =
        current ??
        (await this.repository.create(projectId, actorId, transaction));
      const manual = existing.filter(
        (line) => line.sourceBasis === PROJECT_BOQ_BASIS.MANUAL,
      );
      const next = [
        ...proposal.lines,
        ...manual.map((line) => this.lineData(line)),
      ].map((line, displayOrder) => ({ ...line, boqId: boq.id, displayOrder }));
      await this.repository.replaceLines(boq.id, next, transaction);
      await this.repository.update(
        boq,
        {
          sourceQuotationId: input.quotationId,
          sourceQuotationVersion: input.quotationVersion,
          revision: input.expectedRevision + 1,
          updatedById: actorId,
        },
        transaction,
      );
      await this.repository.recordRevision(
        boq,
        await this.repository.lines(boq.id, transaction),
        actorId,
        transaction,
      );
    });
    return this.get(projectId);
  }

  async updateLine(
    projectId: string,
    lineId: string,
    input: UpdateProjectBoqLineDto,
    actorId: string,
  ): Promise<IProjectBoqView> {
    await this.projects.getById(projectId);
    await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(`project-boq:${projectId}`, transaction);
      const boq = await this.requireBoq(
        projectId,
        input.expectedRevision,
        transaction,
      );
      const lines = await this.repository.lines(boq.id, transaction);
      const line = lines.find((candidate) => candidate.id === lineId);
      if (!line) {
        throw new NotFoundException('שורת חומר לא נמצאה בפרויקט');
      }
      this.validateEdit(input);
      await this.repository.updateLine(
        line,
        {
          requiredQuantity: input.requiredQuantity,
          estimatedUnitCost: input.estimatedUnitCost,
          quantityOverridden:
            line.quantityOverridden ||
            input.requiredQuantity !== line.requiredQuantity,
          reviewState: input.reviewState,
          notes: input.notes.trim(),
        },
        transaction,
      );
      await this.repository.update(
        boq,
        { revision: boq.revision + 1, updatedById: actorId },
        transaction,
      );
      await this.repository.recordRevision(
        boq,
        await this.repository.lines(boq.id, transaction),
        actorId,
        transaction,
      );
    });
    return this.get(projectId);
  }

  async addLine(
    projectId: string,
    input: AddProjectBoqLineDto,
    actorId: string,
  ): Promise<IProjectBoqView> {
    await this.projects.getById(projectId);
    this.validateEdit(input);
    if (
      input.requiredQuantity === null ||
      !input.systemTitle.trim() ||
      !input.componentTitle.trim()
    ) {
      throw new BadRequestException('יש לציין כמות, מערכת ורכיב לחומר נוסף');
    }
    const material = await this.materials.get(input.materialId);
    if (material.status !== MATERIAL_STATUS.ACTIVE) {
      throw new BadRequestException('אפשר להוסיף רק חומר מאושר ופעיל');
    }
    await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(`project-boq:${projectId}`, transaction);
      const boq = await this.requireBoq(
        projectId,
        input.expectedRevision,
        transaction,
      );
      const lines = await this.repository.lines(boq.id, transaction);
      await this.repository.addLine(
        {
          id: randomUUID(),
          boqId: boq.id,
          materialId: material.id,
          sourceKey: `manual:${randomUUID()}`,
          systemTitle: input.systemTitle.trim(),
          componentTitle: input.componentTitle.trim(),
          materialCode: material.code,
          materialName: material.name,
          materialCategory: material.category,
          materialSpecification: material.specification,
          materialUnit: material.unit,
          sourceBasis: PROJECT_BOQ_BASIS.MANUAL,
          proposedQuantity: null,
          requiredQuantity: input.requiredQuantity,
          quantityOverridden: true,
          estimatedUnitCost: input.estimatedUnitCost,
          reviewState: input.reviewState,
          notes: input.notes.trim(),
          sourceSnapshot: { actorId },
          displayOrder: lines.length,
        },
        transaction,
      );
      await this.repository.update(
        boq,
        { revision: boq.revision + 1, updatedById: actorId },
        transaction,
      );
      await this.repository.recordRevision(
        boq,
        await this.repository.lines(boq.id, transaction),
        actorId,
        transaction,
      );
    });
    return this.get(projectId);
  }

  async revision(projectId: string, revision: number): Promise<object> {
    await this.projects.getById(projectId);
    const boq = await this.repository.find(projectId);
    if (!boq) {
      throw new NotFoundException('כתב רכש לא נמצא');
    }
    const snapshot = await this.repository.revision(boq.id, revision);
    if (!snapshot) {
      throw new NotFoundException('גרסת כתב רכש לא נמצאה');
    }
    return {
      revision: snapshot.revision,
      sourceQuotationId: snapshot.sourceQuotationId,
      sourceQuotationVersion: snapshot.sourceQuotationVersion,
      lines: snapshot.lines,
      createdAt: snapshot.createdAt,
    };
  }

  private async proposal(
    projectId: string,
    quotationId: string,
    existing: ProjectBoqLine[],
  ): Promise<IProposal> {
    const quotation = await this.quotations.document(quotationId);
    if (
      quotation.status !== QUOTATION_STATUS.APPROVED ||
      quotation.projectId !== projectId
    ) {
      throw new BadRequestException(
        'יש לבחור הצעה מאושרת המקושרת ישירות לפרויקט',
      );
    }
    const oldByKey = new Map(existing.map((line) => [line.sourceKey, line]));
    const rows: IProposedLine[] = [];
    const unmappedCatalogueItems: string[] = [];
    const included: string[] = [];
    for (const section of quotation.sections) {
      for (const item of section.items) {
        const breakdown = await this.breakdowns.getCurrent(
          item.catalogueItemId,
        );
        if (breakdown.lines.length === 0) {
          unmappedCatalogueItems.push(item.sku);
        }
        for (const material of breakdown.lines) {
          if (material.basis === MATERIAL_BASIS.INCLUDED) {
            included.push(material.materialId);
            continue;
          }
          const sourceKey = `${section.id}:${item.id}:${material.materialId}`;
          const prior = oldByKey.get(sourceKey);
          const proposedQuantity =
            material.quantityPerItem === null
              ? null
              : new Decimal(item.quantity)
                  .times(material.quantityPerItem)
                  .toFixed(8);
          const needsReview =
            material.basis !== MATERIAL_BASIS.FIXED ||
            material.status !== MATERIAL_STATUS.ACTIVE;
          const priorStatus =
            prior && 'materialStatus' in prior.sourceSnapshot
              ? prior.sourceSnapshot.materialStatus
              : null;
          const sourceChanged =
            Boolean(prior) &&
            (prior?.sourceBasis !== material.basis ||
              prior.materialUnit !== material.unit ||
              prior.materialSpecification !== material.specification ||
              prior.materialCode !== material.code ||
              prior.materialName !== material.name ||
              prior.materialCategory !== material.category ||
              prior.proposedQuantity !== proposedQuantity ||
              priorStatus !== material.status);
          const requiredQuantity = prior?.quantityOverridden
            ? prior.requiredQuantity
            : needsReview
              ? null
              : proposedQuantity;
          const mustReview =
            requiredQuantity === null || (needsReview && sourceChanged);
          rows.push({
            id: prior?.id ?? randomUUID(),
            materialId: material.materialId,
            sourceKey,
            systemTitle: section.title,
            componentTitle: item.description,
            materialCode: material.code,
            materialName: material.name,
            materialCategory: material.category,
            materialSpecification: material.specification,
            materialUnit: material.unit,
            sourceBasis: material.basis,
            proposedQuantity,
            requiredQuantity,
            quantityOverridden: prior?.quantityOverridden ?? false,
            estimatedUnitCost: prior?.estimatedUnitCost ?? null,
            reviewState: mustReview
              ? PROJECT_BOQ_REVIEW.PENDING
              : (prior?.reviewState ?? PROJECT_BOQ_REVIEW.CONFIRMED),
            notes: prior?.notes ?? material.notes,
            sourceSnapshot: {
              quotationId,
              quotationVersion: quotation.version,
              quotationLineId: item.id,
              catalogueItemId: item.catalogueItemId,
              catalogueQuantity: item.quantity,
              breakdownRevision: breakdown.revision,
              materialBasis: material.basis,
              materialStatus: material.status,
              quantityPerItem: material.quantityPerItem,
            },
            displayOrder: rows.length,
          });
        }
      }
    }
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          quotationId,
          version: quotation.version,
          lines: rows.map((line) => ({
            sourceKey: line.sourceKey,
            ...this.comparable(line),
          })),
          unmappedCatalogueItems,
          included,
        }),
      )
      .digest('hex');
    return {
      quotation,
      lines: rows,
      unmappedCatalogueItems,
      includedCount: included.length,
      fingerprint,
    };
  }

  private async requireBoq(
    projectId: string,
    revision: number,
    transaction: import('sequelize').Transaction,
  ): Promise<ProjectBoq> {
    const boq = await this.repository.find(projectId, transaction);
    if (!boq) {
      throw new NotFoundException('כתב רכש לא נמצא');
    }
    if (boq.revision !== revision) {
      throw new ConflictException('כתב הרכש השתנה; יש לטעון מחדש');
    }
    return boq;
  }

  private validateEdit(input: UpdateProjectBoqLineDto): void {
    if (
      input.reviewState === PROJECT_BOQ_REVIEW.CONFIRMED &&
      input.requiredQuantity === null
    ) {
      throw new BadRequestException('אי אפשר לאשר שורה ללא כמות נדרשת');
    }
    if (
      input.requiredQuantity !== null &&
      !new Decimal(input.requiredQuantity).isFinite()
    ) {
      throw new BadRequestException('כמות לא תקינה');
    }
    if (
      input.estimatedUnitCost !== null &&
      !new Decimal(input.estimatedUnitCost).isFinite()
    ) {
      throw new BadRequestException('עלות לא תקינה');
    }
  }

  private lineData(line: ProjectBoqLine): IProposedLine {
    return {
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
    };
  }

  private comparable(line: IProposedLine | ProjectBoqLine): object {
    return {
      materialId: line.materialId,
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
      reviewState: line.reviewState,
      notes: line.notes,
      sourceSnapshot: Object.entries(line.sourceSnapshot).sort(
        ([first], [second]) => first.localeCompare(second),
      ),
      displayOrder: line.displayOrder,
    };
  }

  private lineView(line: IProposedLine): IProjectBoqLine {
    const estimatedLineCost =
      line.requiredQuantity !== null && line.estimatedUnitCost !== null
        ? new Decimal(line.requiredQuantity)
            .times(line.estimatedUnitCost)
            .toFixed(4)
        : null;
    return {
      ...line,
      estimatedLineCost,
      requestedQuantity: null,
      orderedQuantity: null,
      remainingQuantity: null,
    };
  }

  private view(
    projectId: string,
    boq: ProjectBoq | null,
    rows: ProjectBoqLine[],
    sourceQuotationNumber: string | null,
  ): IProjectBoqView {
    const lines = rows.map((row) => this.lineView(this.lineData(row)));
    const priced = lines.filter((line) => line.estimatedLineCost !== null);
    const estimatedTotal = priced
      .reduce(
        (total, line) => total.plus(line.estimatedLineCost ?? '0'),
        new Decimal(0),
      )
      .toFixed(4);
    return {
      projectId,
      revision: boq?.revision ?? 0,
      sourceQuotationId: boq?.sourceQuotationId ?? null,
      sourceQuotationVersion: boq?.sourceQuotationVersion ?? null,
      sourceQuotationNumber,
      updatedAt: boq?.updatedAt ?? null,
      lines,
      estimatedTotal,
      missingCostCount: lines.filter((line) => line.estimatedUnitCost === null)
        .length,
      unresolvedCount: lines.filter(
        (line) =>
          line.reviewState === PROJECT_BOQ_REVIEW.PENDING ||
          line.requiredQuantity === null,
      ).length,
      ledgerAvailable: false,
    };
  }
}
