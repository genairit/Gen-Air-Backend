import { Project } from './entities/project.entity';
import { ProjectRepository } from './project.repository';
import { User } from '@Modules/user/entities/user.entity';
import { ProjectMember } from '@Modules/project-member/entities/project-member.entity';
import { buildCustomerReferenceInclude } from '@Modules/customer/constants/customer-reference.constant';

const PROJECT_ID = '00000000-0000-4000-8000-000000000002';

describe('project repository detail query', () => {
  afterEach(() => jest.restoreAllMocks());

  it("loads the parent building's customer and current team for apartments", async () => {
    const findByPk = jest
      .spyOn(Project, 'findByPk')
      .mockRejectedValue(new Error('query captured'));

    await expect(new ProjectRepository().findById(PROJECT_ID)).rejects.toThrow(
      'query captured',
    );

    expect(findByPk.mock.calls[0]?.[1]?.include).toContainEqual(
      expect.objectContaining({
        as: 'parentProject',
        include: [
          buildCustomerReferenceInclude(),
          {
            model: ProjectMember,
            separate: true,
            include: [{ model: User, paranoid: false }],
          },
        ],
      }),
    );
  });
});
