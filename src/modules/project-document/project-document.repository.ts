import {
  TProjectDocumentState,
  IIndexedProjectDocument,
  IProjectDocumentPageMatch,
  IProjectDocumentPageSearch,
} from './interfaces/project-document.interface';

import { Injectable } from '@nestjs/common';
import { Sequelize, QueryTypes, Transaction } from 'sequelize';
import { ProjectDocument } from './entities/project-document.entity';
import { ProjectDocumentPage } from './entities/project-document-page.entity';
import { PROJECT_DOCUMENT_SEARCH_QUERY } from './constants/project-document.constant';

@Injectable()
export class ProjectDocumentRepository {
  findStates(projectId: string): Promise<TProjectDocumentState[]> {
    return ProjectDocument.findAll({
      raw: true,
      where: { projectId },
      attributes: ['fileId', 'status', 'md5Checksum', 'driveModifiedTime'],
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
    return this.database().query<IProjectDocumentPageMatch>(
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

  private database(): Sequelize {
    const database = ProjectDocumentPage.sequelize;

    if (!database) {
      throw new Error('Project document database is unavailable');
    }

    return database;
  }
}
