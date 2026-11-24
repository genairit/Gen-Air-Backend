import { QueryTypes } from 'sequelize';
import { mock } from 'jest-mock-extended';
import type { Transaction } from 'sequelize';
import { ProjectService } from '@Modules/project/project.service';
import { ProjectRepository } from '@Modules/project/project.repository';
import { context, files, fixture } from './publication-integration.fixture';
import type { IProject } from '@Modules/project/interfaces/project.interface';
import { ProjectDriveLinkService } from '@Modules/project-drive-link/project-drive-link.service';
import { DriveTemplateFolderService } from '@Modules/drive-template-folder/drive-template-folder.service';

type TRootProject = Pick<IProject, 'id' | 'driveFolderId' | 'parentProjectId'>;
const createdProjects = new Set<string>();

export const rootWriter = (): ProjectService => {
  const { transactions, drive } = context();
  const repository = mock<ProjectRepository>();
  repository.findById.mockImplementation(
    async (id, transaction): Promise<IProject | null> => {
      const rows = await fixture
        .database()
        .query<TRootProject>(
          'SELECT id,drive_folder_id AS "driveFolderId",parent_project_id AS "parentProjectId" FROM projects WHERE id=$id AND deleted_at IS NULL',
          {
            bind: { id },
            transaction: transaction ?? null,
            type: QueryTypes.SELECT,
          },
        );
      const row = rows.at(0) ?? null;
      return row ? mock<IProject>(row) : null;
    },
  );
  repository.findDriveFolderOwners.mockImplementation(
    (transaction): Promise<TRootProject[]> =>
      fixture
        .database()
        .query<TRootProject>(
          'SELECT id,drive_folder_id AS "driveFolderId",parent_project_id AS "parentProjectId" FROM projects WHERE drive_folder_id IS NOT NULL AND deleted_at IS NULL',
          { transaction: transaction ?? null, type: QueryTypes.SELECT },
        ),
  );
  repository.updateDriveFolderId.mockImplementation(
    async (id, rootId, transaction): Promise<boolean> => {
      const rows = await fixture
        .database()
        .query<{ id: string }>(
          'UPDATE projects SET drive_folder_id=$rootId WHERE id=$id RETURNING id',
          {
            bind: { id, rootId },
            transaction: transaction ?? null,
            type: QueryTypes.SELECT,
          },
        );
      return rows.length === 1;
    },
  );
  drive.getProjectsRootFolderId.mockReturnValue('company-root');
  drive.findParentIds.mockImplementation((id): Promise<string[] | null> =>
    Promise.resolve(files.get(id)?.parents ?? null),
  );
  const ownership = new ProjectDriveLinkService(
    drive,
    repository,
    mock<DriveTemplateFolderService>(),
  );
  return new ProjectService(
    mock(),
    repository,
    mock(),
    mock(),
    mock(),
    mock(),
    mock(),
    transactions,
    mock(),
    mock(),
    ownership,
  );
};
export const insertRootProject = async (
  id: string,
  parentProjectId: string | null = null,
): Promise<void> => {
  createdProjects.add(id);
  await fixture
    .database()
    .query(
      'INSERT INTO projects(id,customer_id,name,code,parent_project_id) VALUES($id,$customerId,$name,$code,$parentProjectId)',
      {
        bind: {
          id,
          customerId: fixture.customerId,
          name: `Project ${id}`,
          code: id,
          parentProjectId,
        },
      },
    );
};
export const runTransaction = <T>(
  work: (transaction: Transaction) => Promise<T>,
): Promise<T> => fixture.database().transaction(work);

export const resetRootClaims = async (): Promise<void> => {
  await fixture
    .database()
    .query(
      'UPDATE projects SET drive_folder_id=NULL WHERE id=ANY($ids::uuid[])',
      { bind: { ids: [...createdProjects] } },
    );
  await fixture
    .database()
    .query('UPDATE projects SET parent_project_id=NULL WHERE id=$id', {
      bind: { id: fixture.projectId },
    });
};
