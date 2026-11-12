import {
  IQuotationApartmentLink,
  IQuotationPrimaryProject,
} from './interfaces/quotation-project.interface';

import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { sortApartments } from './utilities/quotation-apartment.utility';
import { QuotationProjectRepository } from './quotation-project.repository';

@Injectable()
export class QuotationProjectService {
  constructor(private readonly repository: QuotationProjectRepository) {}
  async primaryProjects(
    quotationIds: string[],
    transaction?: Transaction,
  ): Promise<Map<string, IQuotationPrimaryProject>> {
    const rows = await this.repository.findPrimaryProjects(
      quotationIds,
      transaction,
    );

    return new Map(
      rows.map(({ quotationId, ...project }) => [quotationId, project]),
    );
  }
  async primaryProject(
    quotationId: string,
    transaction?: Transaction,
  ): Promise<IQuotationPrimaryProject | null> {
    const projects = await this.primaryProjects([quotationId], transaction);

    return projects.get(quotationId) ?? null;
  }
  async apartmentLinks(
    quotationIds: string[],
    transaction?: Transaction,
  ): Promise<Map<string, IQuotationApartmentLink[]>> {
    const rows = await this.repository.findApartmentLinks(
      quotationIds,
      transaction,
    );
    const linksByQuotation = new Map(
      quotationIds.map((id): [string, IQuotationApartmentLink[]] => [id, []]),
    );
    sortApartments(rows).forEach(({ quotationId, ...link }) =>
      linksByQuotation.get(quotationId)?.push(link),
    );

    return linksByQuotation;
  }
  countApartmentLinks(
    quotationId: string,
    transaction?: Transaction,
  ): Promise<number> {
    return this.repository.countApartmentLinks(quotationId, transaction);
  }
  async replacePrimary(
    quotationId: string,
    projectId: string | null,
    transaction: Transaction,
  ): Promise<void> {
    await this.repository.removePrimary(quotationId, transaction);
    if (!projectId) {
      return;
    }

    await this.repository.createPrimary(quotationId, projectId, transaction);
  }
  replaceApartmentLinks(
    quotationId: string,
    apartmentIds: string[],
    transaction: Transaction,
  ): Promise<void> {
    return this.repository.replaceApartmentLinks(
      quotationId,
      apartmentIds,
      transaction,
    );
  }
}
