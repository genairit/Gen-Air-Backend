import { mock } from 'jest-mock-extended';
import { ProjectBoq } from './entities/project-boq.entity';
import { ProjectBoqRepository } from './project-boq.repository';

jest.mock('./entities/project-boq.entity', () => ({
  ProjectBoq: { findAll: jest.fn() },
}));

describe('ProjectBoqRepository document selection', () => {
  const repository = new ProjectBoqRepository();
  const findAll = jest.spyOn(ProjectBoq, 'findAll');

  afterEach(() => jest.resetAllMocks());

  it('rejects ambiguous project-only operations', async () => {
    findAll.mockResolvedValue([mock<ProjectBoq>(), mock<ProjectBoq>()]);
    await expect(repository.find('project')).rejects.toThrow(
      'בפרויקט יש כמה כתבי רכש; יש לבחור מסמך מסוים',
    );
  });

  it('retains single document and empty project behavior', async () => {
    const document = mock<ProjectBoq>();
    findAll.mockResolvedValue([document]);
    expect(await repository.find('project')).toBe(document);
    findAll.mockResolvedValue([]);
    expect(await repository.find('project')).toBeNull();
  });

  it('scopes the list to the project with deterministic ordering', async () => {
    findAll.mockResolvedValue([]);
    await repository.list('project');
    expect(findAll).toHaveBeenCalledWith({
      where: { projectId: 'project' },
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
    });
  });
});
