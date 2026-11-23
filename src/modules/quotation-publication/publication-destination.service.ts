import type {
  IPublicationCycle,
  IPublicationFolder,
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
      `quotation-publication-folder:${cycle.projectId}`,
      transaction,
    );
    const [project] = await this.repository.select<{
      rootId: string | null;
      linked: boolean;
      parentId: string | null;
    }>(
      `SELECT drive_folder_id AS "rootId",drive_folder_linked AS linked,parent_project_id AS "parentId" FROM projects WHERE id=$projectId AND deleted_at IS NULL`,
      { projectId: cycle.projectId },
      transaction,
    );
    if (!project?.rootId || (cycle.rootId && cycle.rootId !== project.rootId)) {
      throw new Error(PUBLICATION_REASON.MISSING);
    }

    await this.validateRoot(project.rootId, project.parentId, transaction);
    const saved = await this.repository.folder(
      cycle.projectId,
      role,
      transaction,
    );
    if (saved) {
      if (saved.rootId !== project.rootId) {
        throw new Error(PUBLICATION_REASON.MISSING);
      }

      return saved;
    }

    const [template] = await this.repository.select<{ name: string }>(
      `SELECT t.name FROM quotation_publication_roles r JOIN drive_template_folders t ON t.id=r.template_id WHERE r.role=$role AND t.parent_id IS NULL`,
      { role },
      transaction,
    );
    if (!template) {
      throw new Error(PUBLICATION_REASON.DESTINATION);
    }

    const matches = (
      await this.drive.listPublicationChildren(project.rootId)
    ).filter((item): boolean => item.isFolder && item.name === template.name);
    if (matches.length > 1) {
      throw new Error(PUBLICATION_REASON.AMBIGUOUS);
    }

    if (!matches.length && project.linked) {
      throw new Error(PUBLICATION_REASON.COMPLETION_REQUIRED);
    }

    const folderId =
      matches.at(0)?.id ?? (await this.drive.reservePublicationId());
    const folder = {
      projectId: cycle.projectId,
      role,
      rootId: project.rootId,
      folderId,
      label: template.name,
      confirmed: matches.length === 1,
    };
    await this.repository.execute(
      `INSERT INTO quotation_publication_folders(project_id,role,root_id,folder_id,label,confirmed) VALUES($projectId,$role,$rootId,$folderId,$label,$confirmed)`,
      folder,
      transaction,
    );
    return folder;
  }
  async confirm(
    folder: IPublicationFolder,
    transaction: Transaction,
  ): Promise<void> {
    await this.transactions.lockKey(
      `quotation-publication-folder:${folder.projectId}`,
      transaction,
    );
    const metadata = await this.drive.inspectPublicationFile(folder.folderId);
    if (!metadata && !folder.confirmed) {
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
    const actual = await this.drive.inspectPublicationFile(folder.folderId);
    const correctParent =
      actual?.parents.length === 1 && actual.parents[0] === folder.rootId;
    const correctMime = actual?.mimeType === GOOGLE_DRIVE.FOLDER_MIME_TYPE;
    const correctProperties =
      folder.confirmed ||
      (actual?.properties.publicationRole === folder.role &&
        actual.properties.publicationProject === folder.projectId);
    if (
      !actual ||
      actual.trashed ||
      !correctParent ||
      !correctMime ||
      !correctProperties
    ) {
      throw new Error(PUBLICATION_REASON.MISSING);
    }

    await this.repository.execute(
      `UPDATE quotation_publication_folders SET confirmed=true WHERE project_id=$projectId AND role=$role`,
      { projectId: folder.projectId, role: folder.role },
      transaction,
    );
  }
  private async validateRoot(
    rootId: string,
    parentId: string | null,
    transaction: Transaction,
  ): Promise<void> {
    const root = await this.drive.inspectPublicationFile(rootId);
    if (
      !root ||
      root.trashed ||
      root.mimeType !== GOOGLE_DRIVE.FOLDER_MIME_TYPE
    ) {
      throw new Error(PUBLICATION_REASON.MISSING);
    }

    if (!parentId) {
      return;
    }

    const [building] = await this.repository.select<{ rootId: string | null }>(
      `SELECT drive_folder_id AS "rootId" FROM projects WHERE id=$parentId AND deleted_at IS NULL`,
      { parentId },
      transaction,
    );
    if (!building?.rootId) {
      throw new Error(PUBLICATION_REASON.APARTMENT);
    }

    const apartmentContainers = (
      await this.drive.listPublicationChildren(building.rootId)
    ).filter((item): boolean => item.isFolder && item.name === 'דירות');
    const correctContainer =
      apartmentContainers.length === 1 &&
      root.parents.length === 1 &&
      root.parents[0] === apartmentContainers[0].id;
    if (!correctContainer) {
      throw new Error(PUBLICATION_REASON.APARTMENT);
    }
  }
}
