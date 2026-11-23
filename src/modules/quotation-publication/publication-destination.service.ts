import type {
  IPublicationCycle,
  IPublicationFolder,
  IPublicationTemplate,
  IPublicationRootConfiguration,
} from './interfaces/publication.interface';

import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { PublicationRepository } from './publication.repository';
import { PUBLICATION_REASON } from './constants/publication.constant';
import type { PublicationRoleType } from './constants/publication.constant';
import { GoogleDriveService } from '@Providers/google-drive/google-drive.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { APARTMENTS_FOLDER_NAME } from '@Modules/project-drive/constants/project-drive.constant';
import { publicationProjectLockKey } from '@Modules/quotation-publication/utilities/publication-lock.utility';

@Injectable()
export class PublicationDestinationService {
  private readonly logger = new TypedLogger<Meta>(
    PublicationDestinationService.name,
  );
  constructor(
    private readonly repository: PublicationRepository,
    private readonly drive: GoogleDriveService,
    private readonly transactions: DatabaseTransactionService,
  ) {}
  async prepare(
    cycle: IPublicationCycle,
    role: PublicationRoleType,
    transaction: Transaction,
  ): Promise<IPublicationFolder> {
    await this.transactions.lockKey(
      publicationProjectLockKey(cycle.projectId),
      transaction,
    );
    const rootId = cycle.rootId;
    if (!rootId) {
      return this.bindRoot(cycle, role, transaction);
    }

    await this.validateRoot(cycle, transaction);
    const saved = await this.repository.folder(
      cycle.projectId,
      rootId,
      role,
      transaction,
    );
    if (saved) {
      return saved;
    }

    const [template] = await this.repository.select<IPublicationTemplate>(
      `SELECT t.name FROM quotation_publication_roles r JOIN drive_template_folders t ON t.id=r.template_id WHERE r.role=$role AND t.parent_id IS NULL`,
      { role },
      transaction,
    );
    if (!template) {
      throw new Error(PUBLICATION_REASON.DESTINATION);
    }

    const matches = (await this.drive.listPublicationChildren(rootId)).filter(
      (item): boolean => item.isFolder && item.name === template.name,
    );
    if (matches.length > 1) {
      throw new Error(PUBLICATION_REASON.AMBIGUOUS);
    }

    const needsLinkedCompletion =
      matches.length === 0 && cycle.rootContext.linked;
    if (needsLinkedCompletion) {
      throw new Error(PUBLICATION_REASON.COMPLETION_REQUIRED);
    }

    const folder: IPublicationFolder = {
      projectId: cycle.projectId,
      rootId,
      role,
      folderId: matches.at(0)?.id ?? (await this.drive.reservePublicationId()),
      label: template.name,
      confirmed: matches.length === 1,
    };
    await this.repository.execute(
      `INSERT INTO quotation_publication_folders(project_id,role,root_id,folder_id,label,confirmed) VALUES($projectId,$role,$rootId,$folderId,$label,$confirmed)`,
      { ...folder },
      transaction,
    );
    return folder;
  }
  async confirm(
    folder: IPublicationFolder,
    transaction: Transaction,
  ): Promise<void> {
    await this.transactions.lockKey(
      publicationProjectLockKey(folder.projectId),
      transaction,
    );
    const metadata = await this.drive.inspectPublicationFile(folder.folderId);
    const needsCreate = metadata === null && !folder.confirmed;
    if (needsCreate) {
      await this.create(folder);
    }

    const actual = await this.drive.inspectPublicationFile(folder.folderId);
    const liveFolder =
      actual !== null &&
      !actual.trashed &&
      actual.mimeType === GOOGLE_DRIVE.FOLDER_MIME_TYPE;
    const correctParent =
      actual?.parents.length === 1 && actual.parents[0] === folder.rootId;
    const taggedIdentity =
      actual?.properties.publicationRole === folder.role &&
      actual.properties.publicationProject === folder.projectId;
    const correctProperties = folder.confirmed || taggedIdentity;
    if (!liveFolder || !correctParent || !correctProperties) {
      throw new Error(PUBLICATION_REASON.MISSING);
    }

    await this.repository.execute(
      `UPDATE quotation_publication_folders SET confirmed=true WHERE project_id=$projectId AND root_id=$rootId AND role=$role`,
      { projectId: folder.projectId, rootId: folder.rootId, role: folder.role },
      transaction,
    );
  }
  private async bindRoot(
    cycle: IPublicationCycle,
    role: PublicationRoleType,
    transaction: Transaction,
  ): Promise<IPublicationFolder> {
    const [root] = await this.repository.select<IPublicationRootConfiguration>(
      `SELECT p.drive_folder_id AS "rootId",p.drive_folder_linked AS linked,concat(p.code,' — ',p.name) AS "projectLabel",b.drive_folder_id AS "parentRootId",p.parent_project_id AS "parentProjectId" FROM projects p LEFT JOIN projects b ON b.id=p.parent_project_id WHERE p.id=$projectId`,
      { projectId: cycle.projectId },
      transaction,
    );
    if (!root?.rootId) {
      throw new Error(PUBLICATION_REASON.MISSING);
    }

    const rootContext = {
      linked: root.linked,
      projectLabel: root.projectLabel,
      parentRootId: root.parentRootId,
      parentProjectId: root.parentProjectId,
    };
    await this.repository.execute(
      `UPDATE quotation_publication_cycles SET root_id=$rootId,root_context=$rootContext::jsonb WHERE id=$id AND root_id IS NULL`,
      {
        id: cycle.id,
        rootId: root.rootId,
        rootContext: JSON.stringify(rootContext),
      },
      transaction,
    );
    return this.prepare(
      { ...cycle, rootId: root.rootId, rootContext },
      role,
      transaction,
    );
  }
  private async create(folder: IPublicationFolder): Promise<void> {
    try {
      await this.drive.createPublicationFile({
        id: folder.folderId,
        name: folder.label,
        parentId: folder.rootId,
        mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
        properties: {
          publicationRole: folder.role,
          publicationProject: folder.projectId,
        },
        bytes: null,
      });
    } catch {
      this.logger.warn({
        message: 'Publication folder creation requires reconciliation',
      });
    }
  }
  private async validateRoot(
    cycle: IPublicationCycle,
    transaction: Transaction,
  ): Promise<void> {
    const foreignOwners = await this.repository.select<IPublicationTemplate>(
      `SELECT name FROM projects WHERE id<>$projectId AND drive_folder_id=$rootId AND deleted_at IS NULL`,
      { projectId: cycle.projectId, rootId: cycle.rootId },
      transaction,
    );
    if (foreignOwners.length > 0) {
      throw new Error(PUBLICATION_REASON.MISSING);
    }

    const root = await this.drive.inspectPublicationFile(cycle.rootId ?? '');
    const liveFolder =
      root !== null &&
      !root.trashed &&
      root.mimeType === GOOGLE_DRIVE.FOLDER_MIME_TYPE;
    if (!root || !liveFolder) {
      throw new Error(PUBLICATION_REASON.MISSING);
    }

    const buildingRoot = cycle.rootContext.parentRootId;
    const missingBuilding =
      cycle.rootContext.parentProjectId !== null && !buildingRoot;
    if (missingBuilding) {
      throw new Error(PUBLICATION_REASON.APARTMENT);
    }

    if (!buildingRoot) {
      return;
    }

    const containers = (
      await this.drive.listPublicationChildren(buildingRoot)
    ).filter(
      (item): boolean => item.isFolder && item.name === APARTMENTS_FOLDER_NAME,
    );
    const correctContainer =
      containers.length === 1 &&
      root.parents.length === 1 &&
      root.parents[0] === containers[0].id;
    if (!correctContainer) {
      throw new Error(PUBLICATION_REASON.APARTMENT);
    }
  }
}
