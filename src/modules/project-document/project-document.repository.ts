import {
  PROJECT_DOCUMENT_SEARCH_QUERY,
  PROJECT_DOCUMENT_STATE_ATTRIBUTES,
} from './constants/project-document.constant';

import {
  TProjectDocumentState,
  IIndexedProjectDocument,
  IProjectDocumentPageMatch,
  IProjectDocumentPageSearch,
} from './interfaces/project-document.interface';

import { Sequelize } from 'sequelize-typescript';
import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, Transaction } from 'sequelize';
import { ProviderNames } from '@Providers/database/provider-names';
import { ProjectDocument } from './entities/project-document.entity';
import { ProjectDocumentPage } from './entities/project-document-page.entity';

@Injectable()
export class ProjectDocumentRepository {
  constructor(
    @Inject(ProviderNames.SEQUELIZE) private readonly sequelize: Sequelize,
  ) {}

  findStates(projectId: string): Promise<TProjectDocumentState[]> {
    return ProjectDocument.findAll({
      raw: true,
      where: { projectId },
      attributes: [...PROJECT_DOCUMENT_STATE_ATTRIBUTES],
    });
  }

  async deleteDocuments(projectId: string, fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) {
      return;
    }

    await ProjectDocument.destroy({ where: { projectId, fileId: fileIds } });
  }

  async replaceDocument(
    indexed: IIndexedProjectDocument,
    transaction: Transaction,
  ): Promise<void> {
    const documentKey = {
      fileId: indexed.document.fileId,
      projectId: indexed.document.projectId,
    };

    await ProjectDocumentPage.destroy({ where: documentKey, transaction });
    await ProjectDocument.destroy({ where: documentKey, transaction });
    await ProjectDocument.create(indexed.document, { transaction });
    await ProjectDocumentPage.bulkCreate(indexed.pages, { transaction });
  }

  searchPages(
    search: IProjectDocumentPageSearch,
  ): Promise<IProjectDocumentPageMatch[]> {
    return this.sequelize.query<IProjectDocumentPageMatch>(
      PROJECT_DOCUMENT_SEARCH_QUERY,
      {
        type: QueryTypes.SELECT,
        bind: {
          query: search.query,
          limit: search.limit,
          projectId: search.projectId,
        },
      },
    );
  }
}
