import {
  Op,
  Sequelize,
  QueryTypes,
  Transaction,
  WhereOptions,
} from 'sequelize';

import {
  IQuotationApartmentLinkRow,
  IQuotationPrimaryProjectRow,
} from './interfaces/quotation-project.interface';

import { Injectable } from '@nestjs/common';
import { QuotationProject } from './entities/quotation-project.entity';
import { QUOTATION_PROJECT_QUERY } from './constants/quotation-project-query.constant';
import { CUSTOMER_PROJECT_KINDS } from '@Modules/project/constants/customer-project.constant';

@Injectable()
export class QuotationProjectRepository {
  findPrimaryProjects(
    quotationIds: string[],
    transaction?: Transaction,
  ): Promise<IQuotationPrimaryProjectRow[]> {
    return this.database().query<IQuotationPrimaryProjectRow>(
      QUOTATION_PROJECT_QUERY.PRIMARY_PROJECTS,
      {
        type: QueryTypes.SELECT,
        transaction,
        bind: {
          quotationIds,
          projectKind: CUSTOMER_PROJECT_KINDS.PROJECT,
          buildingKind: CUSTOMER_PROJECT_KINDS.BUILDING,
          apartmentKind: CUSTOMER_PROJECT_KINDS.APARTMENT,
        },
      },
    );
  }
  findApartmentLinks(
    quotationIds: string[],
    transaction?: Transaction,
  ): Promise<IQuotationApartmentLinkRow[]> {
    return this.database().query<IQuotationApartmentLinkRow>(
      QUOTATION_PROJECT_QUERY.APARTMENT_LINKS,
      { type: QueryTypes.SELECT, transaction, bind: { quotationIds } },
    );
  }
  countApartmentLinks(
    quotationId: string,
    transaction?: Transaction,
  ): Promise<number> {
    return QuotationProject.count({
      where: { quotationId, isPrimary: false },
      transaction,
    });
  }
  async createPrimary(
    quotationId: string,
    projectId: string,
    transaction?: Transaction,
  ): Promise<void> {
    await QuotationProject.create(
      { quotationId, projectId, isPrimary: true },
      { transaction },
    );
  }
  async removePrimary(
    quotationId: string,
    transaction?: Transaction,
  ): Promise<void> {
    await QuotationProject.destroy({
      where: { quotationId, isPrimary: true },
      transaction,
    });
  }
  async replaceApartmentLinks(
    quotationId: string,
    apartmentIds: string[],
    transaction?: Transaction,
  ): Promise<void> {
    await QuotationProject.destroy({
      where: this.buildRemovedApartmentsWhere(quotationId, apartmentIds),
      transaction,
    });
    await QuotationProject.bulkCreate(
      apartmentIds.map((projectId) => ({
        quotationId,
        projectId,
        isPrimary: false,
      })),
      { transaction, ignoreDuplicates: true },
    );
  }
  private buildRemovedApartmentsWhere(
    quotationId: string,
    keptApartmentIds: string[],
  ): WhereOptions<QuotationProject> {
    const scope = { quotationId, isPrimary: false };
    if (keptApartmentIds.length === 0) {
      return scope;
    }

    return { ...scope, projectId: { [Op.notIn]: keptApartmentIds } };
  }
  private database(): Sequelize {
    const database = QuotationProject.sequelize;
    if (!database) {
      throw new Error('Quotation project database unavailable');
    }

    return database;
  }
}
