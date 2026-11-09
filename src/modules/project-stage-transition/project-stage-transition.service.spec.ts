import {
  PROJECT_STATUS_IDS,
  ARCHIVED_PROJECT_STATUS_IDS,
  WAITING_REASON_SOURCE_STATUS_IDS,
} from '@Constants/project-status.constant';

import {
  ITargetStageNoteQuery,
  TProjectStageTransitionNote,
} from './interfaces/project-stage-transition.interface';

import { ProjectStageTransitionService } from './project-stage-transition.service';
import { ProjectStageTransitionRepository } from './project-stage-transition.repository';

interface IStoredTransition extends TProjectStageTransitionNote {
  createdAt: number;
  toStageId: string;
}

const WAITING = PROJECT_STATUS_IDS.WAITING_FOR_RESPONSE;
const ON_HOLD = ARCHIVED_PROJECT_STATUS_IDS.ON_HOLD;

const createService = (transitions: IStoredTransition[]) => {
  const repository = {
    findNotesByTargetStages: jest.fn(
      ({ projectIds, toStageIds }: ITargetStageNoteQuery) =>
        Promise.resolve(
          transitions
            .filter(
              (transition) =>
                projectIds.includes(transition.projectId) &&
                toStageIds.includes(transition.toStageId),
            )
            .toSorted((first, second) => first.createdAt - second.createdAt),
        ),
    ),
  };
  const service = new ProjectStageTransitionService(
    Object.assign(new ProjectStageTransitionRepository(), repository),
  );

  return { service, repository };
};

const findWaitingReasons = (
  service: ProjectStageTransitionService,
  projectIds: string[],
) =>
  service.findLatestNotesByTargetStages({
    projectIds,
    toStageIds: WAITING_REASON_SOURCE_STATUS_IDS,
  });

describe('ProjectStageTransitionService.findLatestNotesByTargetStages', () => {
  it('maps every project to its newest note into the stages', async () => {
    const { service, repository } = createService([
      {
        projectId: 'project-1',
        toStageId: WAITING,
        note: 'ישנה',
        createdAt: 1,
      },
      {
        projectId: 'project-2',
        toStageId: WAITING,
        note: 'יחידה',
        createdAt: 2,
      },
      {
        projectId: 'project-1',
        toStageId: WAITING,
        note: 'עדכנית',
        createdAt: 3,
      },
    ]);
    const projectIds = ['project-1', 'project-2'];

    const notes = await findWaitingReasons(service, projectIds);

    expect(repository.findNotesByTargetStages).toHaveBeenCalledWith({
      projectIds,
      toStageIds: WAITING_REASON_SOURCE_STATUS_IDS,
    });
    expect(Object.fromEntries(notes)).toEqual({
      'project-1': 'עדכנית',
      'project-2': 'יחידה',
    });
  });

  it('returns the archived On Hold note of a remapped project', async () => {
    const { service } = createService([
      {
        projectId: 'project-1',
        toStageId: ON_HOLD,
        note: 'מלהמתין',
        createdAt: 1,
      },
    ]);

    const notes = await findWaitingReasons(service, ['project-1']);

    expect(notes.get('project-1')).toBe('מלהמתין');
  });

  it('prefers a newer waiting note over an older On Hold one', async () => {
    const { service } = createService([
      {
        projectId: 'project-1',
        toStageId: ON_HOLD,
        note: 'ישנה',
        createdAt: 1,
      },
      {
        projectId: 'project-1',
        toStageId: WAITING,
        note: 'חדשה',
        createdAt: 2,
      },
    ]);

    const notes = await findWaitingReasons(service, ['project-1']);

    expect(notes.get('project-1')).toBe('חדשה');
  });

  it('skips the query when no project is asked for', async () => {
    const { service, repository } = createService([]);

    const notes = await findWaitingReasons(service, []);

    expect(notes.size).toBe(0);
    expect(repository.findNotesByTargetStages).not.toHaveBeenCalled();
  });
});
