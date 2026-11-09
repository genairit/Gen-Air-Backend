import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';
import { ProjectStageTransitionService } from './project-stage-transition.service';
import { ProjectStageTransitionRepository } from './project-stage-transition.repository';

const WAITING_STAGE_ID = PROJECT_STATUS_IDS.WAITING_FOR_RESPONSE;

const createService = () => {
  const repository = {
    findNotesInto: jest.fn().mockResolvedValue([
      { projectId: 'project-1', note: 'סיבה ישנה' },
      { projectId: 'project-2', note: 'סיבה יחידה' },
      { projectId: 'project-1', note: 'סיבה עדכנית' },
    ]),
  };
  const service = new ProjectStageTransitionService(
    Object.assign(new ProjectStageTransitionRepository(), repository),
  );

  return { service, repository };
};

describe('ProjectStageTransitionService.findLatestNotesInto', () => {
  it('maps every project to its newest note into the stage', async () => {
    const { service, repository } = createService();
    const query = {
      projectIds: ['project-1', 'project-2'],
      toStageId: WAITING_STAGE_ID,
    };

    const notes = await service.findLatestNotesInto(query);

    expect(repository.findNotesInto).toHaveBeenCalledWith(query);
    expect(Object.fromEntries(notes)).toEqual({
      'project-1': 'סיבה עדכנית',
      'project-2': 'סיבה יחידה',
    });
  });

  it('skips the query when no project is asked for', async () => {
    const { service, repository } = createService();

    const notes = await service.findLatestNotesInto({
      projectIds: [],
      toStageId: WAITING_STAGE_ID,
    });

    expect(notes.size).toBe(0);
    expect(repository.findNotesInto).not.toHaveBeenCalled();
  });
});
