import { Op } from 'sequelize';
import { ProjectStageTransition } from './entities/project-stage-transition.entity';
import { WAITING_REASON_SOURCE_STATUS_IDS } from '@Constants/project-status.constant';
import { ProjectStageTransitionRepository } from './project-stage-transition.repository';

describe('ProjectStageTransitionRepository.findNotesInto', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads notes into any of the stages, oldest first, so the newest wins', async () => {
    const findAll = jest
      .spyOn(ProjectStageTransition, 'findAll')
      .mockResolvedValue([]);

    await new ProjectStageTransitionRepository().findNotesInto({
      projectIds: ['project-1'],
      toStageIds: WAITING_REASON_SOURCE_STATUS_IDS,
    });

    expect(findAll).toHaveBeenCalledWith({
      attributes: ['projectId', 'note'],
      where: {
        toStageId: { [Op.in]: WAITING_REASON_SOURCE_STATUS_IDS },
        projectId: { [Op.in]: ['project-1'] },
      },
      order: [['createdAt', 'ASC']],
      raw: true,
    });
  });
});
