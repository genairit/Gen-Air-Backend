import {
  files,
  context,
  fixture,
  deferred,
  completeRole,
} from './publication-integration.fixture';

import type {
  IProject,
  TProjectRead,
} from '@Modules/project/interfaces/project.interface';

import { QueryTypes } from 'sequelize';
import { mock } from 'jest-mock-extended';
import type { Transaction } from 'sequelize';
import { rootWriter } from './publication-root-writer.fixture';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { PUBLICATION_ROLE } from '../constants/publication.constant';
import type { PublicationRoleType } from '../constants/publication.constant';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import { DriveTemplateFolderService } from '@Modules/drive-template-folder/drive-template-folder.service';
import { DriveTemplateFolder } from '@Modules/drive-template-folder/entities/drive-template-folder.entity';
import { DriveTemplateFolderRepository } from '@Modules/drive-template-folder/drive-template-folder.repository';
import type { IDriveTemplateFolder } from '@Modules/drive-template-folder/interfaces/drive-template-folder.interface';

type TCreatedRoleIds = Map<PublicationRoleType, string>;
type TRoleVisibility = Map<PublicationRoleType, ICommittedRoleReservation[]>;

export interface ICommittedRoleReservation {
  folderId: string;
  role: PublicationRoleType;
}
export interface IInterruptedCompletion {
  restore: () => void;
  createdIds: TCreatedRoleIds;
  nonRoleFailed: () => boolean;
  visibleAtCreate: TRoleVisibility;
}
export interface IConfirmedRoleReservation extends ICommittedRoleReservation {
  confirmed: boolean;
}

type TCompletionProject = Pick<
  IProject,
  | 'id'
  | 'name'
  | 'code'
  | 'driveFolderId'
  | 'driveFolderLinked'
  | 'parentProjectId'
>;
export const completionService = (): ProjectDriveService => {
  const { drive, destinations } = context();
  const projects = rootWriter();
  const project = async (
    id: string,
    transaction?: Transaction,
  ): Promise<TProjectRead> => {
    const rows = await fixture
      .database()
      .query<TCompletionProject>(
        'SELECT id,name,code,drive_folder_id AS "driveFolderId",drive_folder_linked AS "driveFolderLinked",parent_project_id AS "parentProjectId" FROM projects WHERE id=$id',
        {
          bind: { id },
          transaction: transaction ?? null,
          type: QueryTypes.SELECT,
        },
      );
    const row = rows.at(0) ?? null;
    if (!row) {
      throw new Error('Completion project missing');
    }

    return mock<TProjectRead>({ ...row, waitingReason: null });
  };
  jest
    .spyOn(projects, 'getById')
    .mockImplementation((id): Promise<TProjectRead> => project(id));
  jest
    .spyOn(projects, 'quotationSnapshot')
    .mockImplementation((id, transaction): Promise<IProject> =>
      project(id, transaction),
    );
  jest.spyOn(projects, 'inspectLinkedDriveFolder').mockResolvedValue([]);
  const templateRepository = mock<DriveTemplateFolderRepository>();
  templateRepository.findAll.mockImplementation(
    async (transaction): Promise<DriveTemplateFolder[]> => {
      const rows = await fixture
        .database()
        .query<IDriveTemplateFolder>(
          'SELECT id,name,parent_id AS "parentId",position,created_at AS "createdAt",updated_at AS "updatedAt" FROM drive_template_folders',
          { transaction: transaction ?? null, type: QueryTypes.SELECT },
        );
      return rows.map((row): DriveTemplateFolder =>
        mock<DriveTemplateFolder>(row),
      );
    },
  );
  drive.isConfigured.mockReturnValue(true);
  drive.ensureFolder.mockImplementation((name, parentId): Promise<string> => {
    const matching = [...files.values()].filter(
      (file): boolean =>
        file.name === name &&
        file.parents.includes(parentId) &&
        file.mimeType === GOOGLE_DRIVE.FOLDER_MIME_TYPE,
    );
    if (matching.length > 1) {
      return Promise.reject(new Error('Ambiguous completion folders'));
    }

    return Promise.resolve(matching.at(0)?.id ?? completeRole(parentId, name));
  });
  return new ProjectDriveService(
    projects,
    drive,
    new DriveTemplateFolderService(templateRepository),
    destinations,
  );
};

export const interruptCompletionAfterRoleCreate = (
  rootId: string,
  failingName: string,
): IInterruptedCompletion => {
  const { drive } = context();
  const originalCreate =
    drive.createPublicationFile.getMockImplementation() ?? null;
  const originalEnsure = drive.ensureFolder.getMockImplementation() ?? null;
  if (!originalCreate || !originalEnsure) {
    throw new Error('Completion fake must be initialized');
  }

  const roleCreated = deferred();
  const createdIds = new Map<PublicationRoleType, string>();
  const visibleAtCreate = new Map<
    PublicationRoleType,
    ICommittedRoleReservation[]
  >();
  const state = { fail: true };
  drive.createPublicationFile.mockImplementation(
    async (input): Promise<void> => {
      const role =
        Object.values(PUBLICATION_ROLE).find(
          (candidate): boolean =>
            candidate === input.properties.publicationRole,
        ) ?? null;
      const semanticFolder =
        input.bytes === null && role !== null && input.parentId === rootId;
      if (semanticFolder && role !== null) {
        const reservations = await fixture
          .database()
          .query<ICommittedRoleReservation>(
            'SELECT role,folder_id AS "folderId" FROM quotation_publication_folders WHERE project_id=$projectId AND root_id=$rootId',
            {
              bind: { projectId: fixture.projectId, rootId },
              type: QueryTypes.SELECT,
            },
          );
        visibleAtCreate.set(role, reservations);
        createdIds.set(role, input.id);
      }

      await originalCreate(input);
      if (role === PUBLICATION_ROLE.ARCHIVE) {
        roleCreated.resolve();
        throw new Error('Lost semantic role create response');
      }
    },
  );
  drive.ensureFolder.mockImplementation(
    async (name, parentId): Promise<string> => {
      if (name === failingName && state.fail) {
        await roleCreated.promise;
        state.fail = false;
        throw new Error('Later non-role template step failed');
      }

      return originalEnsure(name, parentId);
    },
  );
  return {
    createdIds,
    visibleAtCreate,
    nonRoleFailed: (): boolean => !state.fail,
    restore: (): void => {
      drive.createPublicationFile.mockImplementation(originalCreate);
      drive.ensureFolder.mockImplementation(originalEnsure);
    },
  };
};
