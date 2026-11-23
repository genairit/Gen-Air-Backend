import type {
  IPublicationCycle,
  IPublicationFolder,
  IPublicationTemplate,
  IPublicationFolderScope,
  IPublicationRoleBinding,
  IPublicationTemplateNaming,
  IPublicationRootConfiguration,
} from './interfaces/publication.interface';

import {
  publicationProjectLockKey,
  publicationPhysicalRootLockKey,
} from '@Modules/quotation-publication/utilities/publication-lock.utility';

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
import { renderDriveFolderName } from '@Modules/project-drive/utilities/drive-folder-name.utility';

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
    const authorized = await this.authority(cycle, transaction);
    const rootId = authorized.rootId;
    if (!rootId) {
      return this.bindRoot(authorized, role, transaction);
    }

    return this.prepareFolder(
      {
        projectId: cycle.projectId,
        rootId,
        linked: authorized.rootContext.linked,
      },
      role,
      transaction,
    );
  }
  async ensureRoleFolder(
    scope: IPublicationFolderScope,
    role: PublicationRoleType,
    transaction: Transaction,
  ): Promise<string> {
    const folder = await this.repository.folder(
      scope.projectId,
      scope.rootId,
      role,
      transaction,
    );
    if (!folder) {
      throw new Error(PUBLICATION_REASON.DESTINATION);
    }

    const linkedPending = scope.linked && !folder.confirmed;
    const missingLinkedFolder =
      linkedPending &&
      !(await this.drive.inspectPublicationFile(folder.folderId));
    if (missingLinkedFolder) {
      throw new Error(PUBLICATION_REASON.COMPLETION_REQUIRED);
    }

    await this.confirmFolder(folder, transaction);
    return folder.folderId;
  }
  async prepareRoleFolder(
    scope: IPublicationFolderScope,
    role: PublicationRoleType,
    transaction: Transaction,
  ): Promise<IPublicationFolder> {
    return this.prepareFolder(scope, role, transaction);
  }
  private async prepareFolder(
    scope: IPublicationFolderScope,
    role: PublicationRoleType,
    transaction: Transaction,
  ): Promise<IPublicationFolder> {
    const saved = await this.repository.folder(
      scope.projectId,
      scope.rootId,
      role,
      transaction,
    );
    if (saved) {
      const linkedPending = scope.linked && !saved.confirmed;
      if (linkedPending) {
        const existing = await this.drive.inspectPublicationFile(
          saved.folderId,
        );
        if (!existing) {
          throw new Error(PUBLICATION_REASON.COMPLETION_REQUIRED);
        }
      }

      return saved;
    }

    const [template] = await this.repository.select<IPublicationTemplateNaming>(
      `SELECT t.name AS "templateName",p.code,p.name FROM quotation_publication_roles r JOIN drive_template_folders t ON t.id=r.template_id JOIN projects p ON p.id=$projectId WHERE r.role=$role AND t.parent_id IS NULL`,
      { role, projectId: scope.projectId },
      transaction,
    );
    if (!template) {
      throw new Error(PUBLICATION_REASON.DESTINATION);
    }

    const label = renderDriveFolderName(template.templateName, template);
    const matches = (
      await this.drive.listPublicationChildren(scope.rootId)
    ).filter((item): boolean => item.isFolder && item.name === label);
    if (matches.length > 1) {
      throw new Error(PUBLICATION_REASON.AMBIGUOUS);
    }

    const needsLinkedCompletion = matches.length === 0 && scope.linked;
    if (needsLinkedCompletion) {
      throw new Error(PUBLICATION_REASON.COMPLETION_REQUIRED);
    }

    const folder: IPublicationFolder = {
      projectId: scope.projectId,
      rootId: scope.rootId,
      role,
      folderId: matches.at(0)?.id ?? (await this.drive.reservePublicationId()),
      label,
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
    cycle: IPublicationCycle,
    folder: IPublicationFolder,
    transaction: Transaction,
  ): Promise<void> {
    await this.authority(cycle, transaction);
    await this.confirmFolder(folder, transaction);
  }
  private async confirmFolder(
    folder: IPublicationFolder,
    transaction: Transaction,
  ): Promise<void> {
    const metadata = await this.drive.inspectPublicationFile(folder.folderId);
    const needsCreate = metadata === null && !folder.confirmed;
    if (needsCreate) {
      const conflictingSibling = (
        await this.drive.listPublicationChildren(folder.rootId)
      ).some(
        (item): boolean =>
          item.isFolder &&
          item.name === folder.label &&
          item.id !== folder.folderId,
      );
      if (conflictingSibling) {
        throw new Error(PUBLICATION_REASON.AMBIGUOUS);
      }

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
  async prepareTemplateRoleFolder(
    projectId: string,
    rootId: string,
    templateId: string,
    transaction: Transaction,
  ): Promise<void> {
    const binding = await this.templateRole(templateId, transaction);
    if (!binding) {
      return;
    }

    await this.prepareFolder(
      { projectId, rootId, linked: false },
      binding.role,
      transaction,
    );
  }
  async completeReservedTemplateFolder(
    projectId: string,
    rootId: string,
    templateId: string,
    transaction: Transaction,
  ): Promise<string | null> {
    const binding = await this.templateRole(templateId, transaction);
    if (!binding) {
      return null;
    }

    return this.ensureRoleFolder(
      { projectId, rootId, linked: false },
      binding.role,
      transaction,
    );
  }
  private async templateRole(
    templateId: string,
    transaction: Transaction,
  ): Promise<IPublicationRoleBinding | null> {
    const [binding] = await this.repository.select<IPublicationRoleBinding>(
      `SELECT role FROM quotation_publication_roles WHERE template_id=$templateId`,
      { templateId },
      transaction,
    );
    return binding ?? null;
  }
  private async authority(
    cycle: IPublicationCycle,
    transaction: Transaction,
  ): Promise<IPublicationCycle> {
    const parentId = cycle.rootContext.parentProjectId;
    const projectIds = [
      cycle.projectId,
      ...(parentId ? [parentId] : []),
    ].sort();
    for (const id of projectIds) {
      await this.transactions.lockKey(
        publicationProjectLockKey(id),
        transaction,
      );
    }
    if (!cycle.rootId) {
      return cycle;
    }

    const needsLineage =
      parentId !== null && cycle.rootContext.parentRootId === null;
    const [building] = needsLineage
      ? await this.repository.select<{ rootId: string | null }>(
          `SELECT drive_folder_id AS "rootId" FROM projects WHERE id=$parentId AND deleted_at IS NULL`,
          { parentId },
          transaction,
        )
      : [];
    const parentRootId =
      cycle.rootContext.parentRootId ?? building?.rootId ?? null;
    const roots = [
      cycle.rootId,
      ...(parentRootId ? [parentRootId] : []),
    ].sort();
    for (const root of roots) {
      await this.transactions.lockKey(
        publicationPhysicalRootLockKey(root),
        transaction,
      );
    }
    const authorized = {
      ...cycle,
      rootContext: { ...cycle.rootContext, parentRootId },
    };
    await this.validateRoot(authorized, transaction);
    if (needsLineage && parentRootId) {
      await this.repository.execute(
        `SELECT set_config('genair.publication_lineage_fill',$cycleId,true)`,
        { cycleId: cycle.id },
        transaction,
      );
      await this.repository.execute(
        `UPDATE quotation_publication_cycles SET root_context=jsonb_set(root_context,'{parentRootId}',to_jsonb($parentRootId::text)) WHERE id=$id AND root_context->>'parentRootId' IS NULL AND root_context->>'parentProjectId'=$parentId`,
        { id: cycle.id, parentRootId, parentId },
        transaction,
      );
    }
    return authorized;
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

    const parentRootId = cycle.rootContext.parentRootId;
    const parentProjectId = cycle.rootContext.parentProjectId;
    const parentOwners = parentRootId
      ? await this.repository.select<IPublicationTemplate>(
          `SELECT name FROM projects WHERE id<>$parentProjectId AND drive_folder_id=$parentRootId AND deleted_at IS NULL`,
          { parentProjectId, parentRootId },
          transaction,
        )
      : [];
    if (parentOwners.length > 0) {
      throw new Error(PUBLICATION_REASON.APARTMENT);
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
