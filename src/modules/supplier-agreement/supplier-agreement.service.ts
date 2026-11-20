import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import type {
  AgreementTermsDto,
  UpdateSupplierDto,
  CreateAgreementDto,
  SupplierDetailsDto,
  UpdateAgreementDto,
} from './dto/supplier-agreement.dto';

import type {
  ISupplierView,
  IAgreementView,
  TAgreementSelection,
  IAgreementRevisionView,
  IAgreementSelectionLine,
} from './interfaces/supplier-agreement.interface';

import Decimal from 'decimal.js';
import type { Transaction } from 'sequelize';
import type { Supplier } from './entities/supplier.entity';
import { currentDateOnly, isValidDateOnly } from '@Utilities/date.utility';
import { ProjectBoqService } from '@Modules/project-boq/project-boq.service';
import { SupplierAgreementRepository } from './supplier-agreement.repository';
import type { ProjectSupplierAgreement } from './entities/project-supplier-agreement.entity';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

@Injectable()
export class SupplierAgreementService {
  constructor(
    private readonly repository: SupplierAgreementRepository,
    private readonly boq: ProjectBoqService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  async searchSuppliers(search = ''): Promise<ISupplierView[]> {
    if (search.length > 100) {
      throw new BadRequestException('החיפוש ארוך מדי');
    }
    const suppliers = await this.repository.searchSuppliers(search.trim());
    return suppliers.map((supplier) => this.supplierView(supplier));
  }

  async createSupplier(
    input: SupplierDetailsDto,
    actorId: string,
  ): Promise<ISupplierView> {
    const values = this.supplierValues(input);
    const supplier = await this.transactions.run((transaction) =>
      this.repository.createSupplier(
        {
          ...values,
          active: input.active ?? true,
          version: 1,
          createdById: actorId,
          updatedById: actorId,
        },
        transaction,
      ),
    );
    return this.supplierView(supplier);
  }

  async updateSupplier(
    id: string,
    input: UpdateSupplierDto,
    actorId: string,
  ): Promise<ISupplierView> {
    const values = this.supplierValues(input);
    const supplier = await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(`supplier:${id}`, transaction);
      const current = await this.repository.supplier(id, transaction);
      if (!current) {
        throw new NotFoundException('ספק לא נמצא');
      }
      if (current.version !== input.expectedVersion) {
        throw new ConflictException('פרטי הספק השתנו; יש לטעון מחדש');
      }
      return this.repository.updateSupplier(
        current,
        {
          ...values,
          active: input.active ?? current.active,
          version: current.version + 1,
          updatedById: actorId,
        },
        transaction,
      );
    });
    return this.supplierView(supplier);
  }

  async projectAgreements(projectId: string): Promise<IAgreementView[]> {
    await this.boq.get(projectId);
    const agreements = await this.repository.agreements(projectId);
    const suppliers = await this.repository.suppliersByIds([
      ...new Set(agreements.map((agreement) => agreement.supplierId)),
    ]);
    const supplierNames = new Map(
      suppliers.map((supplier) => [supplier.id, supplier.name]),
    );
    return agreements.map((agreement) =>
      this.agreementView(
        agreement,
        supplierNames.get(agreement.supplierId) ?? '',
      ),
    );
  }

  async createAgreement(
    projectId: string,
    input: CreateAgreementDto,
    actorId: string,
  ): Promise<IAgreementView> {
    const agreement = await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(`project-boq:${projectId}`, transaction);
      const boq = await this.boq.get(projectId);
      const line = boq.lines.find((item) => item.id === input.boqLineId);
      if (!line) {
        throw new NotFoundException('שורת חומר לא נמצאה בפרויקט');
      }
      const supplier = await this.repository.supplier(
        input.supplierId,
        transaction,
      );
      if (!supplier?.active) {
        throw new BadRequestException('יש לבחור ספק פעיל');
      }
      const existing = await this.repository.agreements(projectId, transaction);
      if (
        existing.some(
          (item) =>
            item.boqSourceKey === line.sourceKey &&
            item.supplierId === supplier.id &&
            item.materialId === line.materialId &&
            item.materialUnit === line.materialUnit,
        )
      ) {
        throw new ConflictException('כבר קיים הסכם לספק ולחומר בפרויקט');
      }
      const values = this.agreementValues(input);
      const created = await this.repository.createAgreement(
        {
          ...values,
          projectId,
          boqSourceKey: line.sourceKey,
          materialId: line.materialId,
          materialUnit: line.materialUnit,
          supplierId: supplier.id,
          version: 1,
          createdById: actorId,
          updatedById: actorId,
        },
        transaction,
      );
      await this.recordRevision(created, actorId, transaction);
      return created;
    });
    const supplier = await this.repository.supplier(agreement.supplierId);
    return this.agreementView(agreement, supplier?.name ?? '');
  }

  async updateAgreement(
    projectId: string,
    id: string,
    input: UpdateAgreementDto,
    actorId: string,
  ): Promise<IAgreementView> {
    const agreement = await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(`project-boq:${projectId}`, transaction);
      const current = await this.repository.agreement(
        projectId,
        id,
        transaction,
      );
      if (!current) {
        throw new NotFoundException('הסכם ספק לא נמצא בפרויקט');
      }
      if (current.version !== input.expectedVersion) {
        throw new ConflictException('ההסכם השתנה; יש לטעון מחדש');
      }
      const boq = await this.boq.get(projectId);
      const line = boq.lines.find(
        (item) => item.sourceKey === current.boqSourceKey,
      );
      if (
        !line ||
        line.materialId !== current.materialId ||
        line.materialUnit !== current.materialUnit
      ) {
        throw new ConflictException('החומר השתנה בכתב הרכש; יש לבדוק את ההסכם');
      }
      const values = this.agreementValues(input);
      const updated = await this.repository.updateAgreement(
        current,
        {
          ...values,
          active: input.active ?? current.active,
          notes: input.notes?.trim() ?? current.notes,
          version: current.version + 1,
          updatedById: actorId,
        },
        transaction,
      );
      await this.recordRevision(updated, actorId, transaction);
      return updated;
    });
    const supplier = await this.repository.supplier(agreement.supplierId);
    return this.agreementView(agreement, supplier?.name ?? '');
  }

  async history(
    projectId: string,
    agreementId: string,
  ): Promise<IAgreementRevisionView[]> {
    await this.boq.get(projectId);
    const agreement = await this.repository.agreement(projectId, agreementId);
    if (!agreement) {
      throw new NotFoundException('הסכם ספק לא נמצא בפרויקט');
    }
    const revisions = await this.repository.revisions(agreementId);
    return revisions.map((revision) => ({
      version: revision.version,
      snapshot: revision.snapshot,
      actorId: revision.actorId,
      createdAt: revision.createdAt,
    }));
  }

  async resolveSelection(
    projectId: string,
    supplierId: string,
    lines: IAgreementSelectionLine[],
    orderDate: string | null,
    transaction: Transaction,
  ): Promise<TAgreementSelection> {
    const supplier = await this.repository.supplier(supplierId, transaction);
    if (!supplier?.active) {
      throw new BadRequestException('יש לבחור ספק פעיל');
    }
    const agreements = await this.repository.agreementsByIds(
      lines.map((line) => line.agreementId),
      transaction,
    );
    const byId = new Map(
      agreements.map((agreement) => [agreement.id, agreement]),
    );
    const effectiveDate = orderDate ?? currentDateOnly();
    if (!isValidDateOnly(effectiveDate)) {
      throw new BadRequestException('תאריך ההזמנה אינו תקין');
    }
    const selected = new Map<
      string,
      { id: string; version: number; unitPrice: string; currencyCode: string }
    >();
    for (const line of lines) {
      const agreement = byId.get(line.agreementId);
      if (
        !agreement ||
        !agreement.active ||
        agreement.projectId !== projectId ||
        agreement.supplierId !== supplierId ||
        agreement.boqSourceKey !== line.boqSourceKey ||
        agreement.materialId !== line.materialId ||
        agreement.materialUnit !== line.materialUnit ||
        (agreement.effectiveFrom && effectiveDate < agreement.effectiveFrom) ||
        (agreement.effectiveThrough &&
          effectiveDate > agreement.effectiveThrough)
      ) {
        throw new ConflictException('הסכם הספק אינו מתאים לחומר או לתאריך');
      }
      if (
        line.unitCost &&
        !new Decimal(line.unitCost).eq(agreement.unitPrice)
      ) {
        throw new ConflictException('מחיר השורה שונה ממחיר ההסכם');
      }
      if (
        line.agreementVersion &&
        line.agreementVersion !== agreement.version
      ) {
        throw new ConflictException('הסכם הספק השתנה; יש לטעון מחדש');
      }
      selected.set(line.boqSourceKey, {
        id: agreement.id,
        version: agreement.version,
        unitPrice: agreement.unitPrice,
        currencyCode: agreement.currencyCode,
      });
    }
    return {
      selectedSupplier: this.supplierView(supplier),
      agreements: selected,
    };
  }

  private supplierValues(input: SupplierDetailsDto) {
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException('יש לציין שם ספק');
    }
    return {
      name,
      contactName: input.contactName?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      notes: input.notes?.trim() ?? '',
    };
  }

  private agreementValues(input: AgreementTermsDto) {
    const from = input.effectiveFrom || null;
    const through = input.effectiveThrough || null;
    if (
      (from && !isValidDateOnly(from)) ||
      (through && !isValidDateOnly(through)) ||
      (from && through && from > through)
    ) {
      throw new BadRequestException('טווח תוקף ההסכם אינו תקין');
    }
    const price = new Decimal(input.unitPrice);
    const quantity = input.agreedQuantity
      ? new Decimal(input.agreedQuantity)
      : null;
    if (
      !price.isFinite() ||
      price.lt(0) ||
      (quantity && (!quantity.isFinite() || quantity.lte(0)))
    ) {
      throw new BadRequestException('מחיר או כמות ההסכם אינם תקינים');
    }
    return {
      unitPrice: price.toFixed(4),
      currencyCode: input.currencyCode,
      agreedQuantity: quantity?.toFixed(8) ?? null,
      effectiveFrom: from,
      effectiveThrough: through,
      active: input.active ?? true,
      notes: input.notes?.trim() ?? '',
    };
  }

  private supplierView(supplier: Supplier): ISupplierView {
    return {
      id: supplier.id,
      name: supplier.name,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      notes: supplier.notes,
      active: supplier.active,
      version: supplier.version,
    };
  }

  private agreementView(
    agreement: ProjectSupplierAgreement,
    supplierName: string,
  ): IAgreementView {
    return {
      id: agreement.id,
      projectId: agreement.projectId,
      boqSourceKey: agreement.boqSourceKey,
      materialId: agreement.materialId,
      materialUnit: agreement.materialUnit,
      supplierId: agreement.supplierId,
      supplierName,
      unitPrice: agreement.unitPrice,
      currencyCode: agreement.currencyCode,
      agreedQuantity: agreement.agreedQuantity,
      effectiveFrom: agreement.effectiveFrom,
      effectiveThrough: agreement.effectiveThrough,
      active: agreement.active,
      version: agreement.version,
      notes: agreement.notes,
    };
  }

  private recordRevision(
    agreement: ProjectSupplierAgreement,
    actorId: string,
    transaction: Transaction,
  ): Promise<unknown> {
    return this.repository.createRevision(
      {
        agreementId: agreement.id,
        version: agreement.version,
        actorId,
        snapshot: this.agreementView(agreement, ''),
      },
      transaction,
    );
  }
}
