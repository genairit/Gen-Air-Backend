import { Test } from '@nestjs/testing';
import { ProjectService } from './project.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProjectRepository } from './project.repository';
import { USER_ROLES } from '@Constants/user-role.constant';
import { InternalServerErrorException } from '@nestjs/common';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { DOMAIN_EVENTS } from '@Constants/domain-events.constant';
import { TProjectCreationAttributes } from './interfaces/project.interface';
import { ProjectTypeService } from '@Modules/project-type/project-type.service';
import { ProjectStageService } from '@Modules/project-stage/project-stage.service';
import { ProjectMemberService } from '@Modules/project-member/project-member.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { ProjectStageTransitionService } from '@Modules/project-stage-transition/project-stage-transition.service';

const TRANSACTION = { id: 'transaction' };
const PROJECT_ID = 'project-1';
const QUOTE_STAGE_ID = 'stage-quote';
const ORDER_STAGE_ID = 'stage-order';

const CREATOR: IUser = {
  id: 'user-1',
  deletedAt: null,
  lastName: 'כהן',
  firstName: 'אביעד',
  phone: '052-4418230',
  employeeNumber: 'EMP-1001',
  email: 'aviad@gen-air.co.il',
  role: USER_ROLES.SYSTEM_ADMIN,
  createdAt: new Date('2026-10-07T00:00:00.000Z'),
  updatedAt: new Date('2026-10-07T00:00:00.000Z'),
};

const createService = async () => {
  const projectRepository = {
    countGroupedByStage: jest.fn().mockResolvedValue([
      { stageId: QUOTE_STAGE_ID, count: 2 },
      { stageId: ORDER_STAGE_ID, count: 3 },
    ]),
    create: jest
      .fn<Promise<{ id: string }>, [TProjectCreationAttributes, object]>()
      .mockResolvedValue({ id: PROJECT_ID }),
    update: jest.fn().mockResolvedValue(true),
    isCodeTaken: jest.fn().mockResolvedValue(false),
    findById: jest
      .fn()
      .mockResolvedValue({ id: PROJECT_ID, stageId: QUOTE_STAGE_ID }),
  };
  const projectStageService = {
    getById: jest.fn().mockResolvedValue({ id: ORDER_STAGE_ID }),
    getInitialStage: jest.fn().mockResolvedValue({ id: QUOTE_STAGE_ID }),
  };
  const projectMemberService = {
    replaceForProject: jest.fn().mockResolvedValue(null),
    validateAssignments: jest.fn().mockResolvedValue(null),
  };
  const transitionService = { record: jest.fn().mockResolvedValue(null) };
  const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
  const transactionService = {
    run: jest.fn((work: (transaction: object) => Promise<unknown>) =>
      work(TRANSACTION),
    ),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ProjectService,
      { provide: EventEmitter2, useValue: eventEmitter },
      { provide: ProjectRepository, useValue: projectRepository },
      { provide: ProjectStageService, useValue: projectStageService },
      { provide: ProjectMemberService, useValue: projectMemberService },
      { provide: DatabaseTransactionService, useValue: transactionService },
      { provide: ProjectStageTransitionService, useValue: transitionService },
      {
        provide: ProjectTypeService,
        useValue: { getById: jest.fn().mockResolvedValue({ id: 'type-1' }) },
      },
    ],
  }).compile();

  return {
    service: moduleRef.get(ProjectService),
    eventEmitter,
    projectRepository,
    transitionService,
    projectMemberService,
  };
};

describe('ProjectService.create', () => {
  const PROJECT = {
    name: 'מגדל פארק בבלי C',
    projectTypeId: 'type-1',
    members: [{ userId: 'user-2', role: USER_ROLES.SECRETARY }],
  };

  it('creates the project in the first stage with its members and an opening timeline entry', async () => {
    const {
      service,
      projectRepository,
      projectMemberService,
      transitionService,
    } = await createService();

    await service.create(PROJECT, CREATOR);

    const [createdAttributes, transaction] =
      projectRepository.create.mock.calls[0];

    expect(transaction).toBe(TRANSACTION);
    expect(createdAttributes.code).toMatch(/^אכ-[0-9]{5}$/);
    expect(createdAttributes).toMatchObject({
      stageId: QUOTE_STAGE_ID,
      createdById: CREATOR.id,
    });
    expect(projectMemberService.replaceForProject).toHaveBeenCalledWith(
      PROJECT_ID,
      PROJECT.members,
      TRANSACTION,
    );
    expect(transitionService.record).toHaveBeenCalledWith(
      expect.objectContaining({ fromStageId: null, toStageId: QUOTE_STAGE_ID }),
      TRANSACTION,
    );
  });

  it('announces the new project after it is saved so Drive folders get created', async () => {
    const { service, eventEmitter } = await createService();

    await service.create(PROJECT, CREATOR);

    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      DOMAIN_EVENTS.PROJECT_CREATED,
      { projectId: PROJECT_ID },
    );
  });

  it('retries the project code when it is already taken', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.isCodeTaken
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await service.create(PROJECT, CREATOR);

    expect(projectRepository.isCodeTaken).toHaveBeenCalledTimes(2);
  });

  it('gives up after the maximum number of code collisions', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.isCodeTaken.mockResolvedValue(true);

    await expect(service.create(PROJECT, CREATOR)).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(projectRepository.create).not.toHaveBeenCalled();
  });
});

describe('ProjectService.move', () => {
  it('updates the stage and records who moved it', async () => {
    const { service, projectRepository, transitionService } =
      await createService();

    await service.move(PROJECT_ID, { stageId: ORDER_STAGE_ID }, CREATOR);

    expect(projectRepository.update).toHaveBeenCalledWith(
      PROJECT_ID,
      { stageId: ORDER_STAGE_ID },
      TRANSACTION,
    );
    expect(transitionService.record).toHaveBeenCalledWith(
      {
        note: null,
        changedBy: CREATOR,
        projectId: PROJECT_ID,
        toStageId: ORDER_STAGE_ID,
        fromStageId: QUOTE_STAGE_ID,
      },
      TRANSACTION,
    );
  });

  it('records nothing when dropped back into the same stage', async () => {
    const { service, projectRepository, transitionService } =
      await createService();

    await service.move(PROJECT_ID, { stageId: QUOTE_STAGE_ID }, CREATOR);

    expect(projectRepository.update).not.toHaveBeenCalled();
    expect(transitionService.record).not.toHaveBeenCalled();
  });
});

describe('ProjectService.update', () => {
  it('leaves members untouched when the form does not send them', async () => {
    const { service, projectMemberService, transitionService } =
      await createService();

    await service.update(PROJECT_ID, { name: 'שם חדש' }, CREATOR);

    expect(projectMemberService.replaceForProject).not.toHaveBeenCalled();
    expect(transitionService.record).not.toHaveBeenCalled();
  });
});

describe('ProjectService.getStageCounts', () => {
  it('returns the count per stage and the overall total', async () => {
    const { service } = await createService();

    await expect(service.getStageCounts({})).resolves.toEqual({
      total: 5,
      byStage: { [QUOTE_STAGE_ID]: 2, [ORDER_STAGE_ID]: 3 },
    });
  });
});
