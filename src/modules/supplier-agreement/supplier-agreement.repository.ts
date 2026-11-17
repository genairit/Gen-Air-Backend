import { Injectable } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { Supplier } from './entities/supplier.entity';
import { ProjectSupplierAgreement } from './entities/project-supplier-agreement.entity';
import { ProjectSupplierAgreementRevision } from './entities/project-supplier-agreement-revision.entity';

@Injectable()
export class SupplierAgreementRepository {
  searchSuppliers(search: string): Promise<Supplier[]> {
    return Supplier.findAll({
      where: search ? { name: { [Op.iLike]: `%${search}%` } } : {},
      order: [['name', 'ASC']],
    });
  }

  supplier(id: string, transaction?: Transaction): Promise<Supplier | null> {
    return Supplier.findByPk(id, { transaction });
  }

  suppliersByIds(
    ids: string[],
    transaction?: Transaction,
  ): Promise<Supplier[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return Supplier.findAll({ where: { id: { [Op.in]: ids } }, transaction });
  }

  createSupplier(
    values: Partial<Supplier>,
    transaction: Transaction,
  ): Promise<Supplier> {
    return Supplier.create(values, { transaction });
  }

  updateSupplier(
    supplier: Supplier,
    values: Partial<Supplier>,
    transaction: Transaction,
  ): Promise<Supplier> {
    return supplier.update(values, { transaction });
  }

  agreements(
    projectId: string,
    transaction?: Transaction,
  ): Promise<ProjectSupplierAgreement[]> {
    return ProjectSupplierAgreement.findAll({
      where: { projectId },
      order: [['createdAt', 'ASC']],
      transaction,
    });
  }

  agreement(
    projectId: string,
    id: string,
    transaction?: Transaction,
  ): Promise<ProjectSupplierAgreement | null> {
    return ProjectSupplierAgreement.findOne({
      where: { id, projectId },
      transaction,
    });
  }

  agreementsByIds(
    ids: string[],
    transaction: Transaction,
  ): Promise<ProjectSupplierAgreement[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return ProjectSupplierAgreement.findAll({
      where: { id: { [Op.in]: ids } },
      transaction,
    });
  }

  createAgreement(
    values: Partial<ProjectSupplierAgreement>,
    transaction: Transaction,
  ): Promise<ProjectSupplierAgreement> {
    return ProjectSupplierAgreement.create(values, { transaction });
  }

  updateAgreement(
    agreement: ProjectSupplierAgreement,
    values: Partial<ProjectSupplierAgreement>,
    transaction: Transaction,
  ): Promise<ProjectSupplierAgreement> {
    return agreement.update(values, { transaction });
  }

  createRevision(
    values: Partial<ProjectSupplierAgreementRevision>,
    transaction: Transaction,
  ): Promise<ProjectSupplierAgreementRevision> {
    return ProjectSupplierAgreementRevision.create(values, { transaction });
  }

  revisions(agreementId: string): Promise<ProjectSupplierAgreementRevision[]> {
    return ProjectSupplierAgreementRevision.findAll({
      where: { agreementId },
      order: [['version', 'DESC']],
    });
  }
}
