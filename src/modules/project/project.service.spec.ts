import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  TProjectUpdateAttributes,
  TProjectCreationAttributes,
} from './interfaces/project.interface';

import { Test } from '@nestjs/testing';
import { ProjectService } from './project.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProjectRepository } from './project.repository';
import { USER_ROLES } from '@Constants/user-role.constant';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { DOMAIN_EVENTS } from '@Constants/domain-events.constant';
import { ProjectTypeService } from '@Modules/project-type/project-type.service';
import { ProjectStageService } from '@Modules/project-stage/project-stage.service';
import { ProjectMemberService } from '@Modules/project-member/project-member.service';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { ProjectStageTransitionService } from '@Modules/project-stage-transition/project-stage-transition.service';

const TRANSACTION = { id: 'transaction' };
const PROJECT_ID = 'project-1';
const QUOTE_STAGE_ID = 'stage-quote';
const ORDER_STAGE_ID = 'stage-order';
const COMPANY_TYPE_ID = 'type-company';
const PRIVATE_TYPE_ID = 'type-private';

const PROJECT_TYPES = {
  [COMPANY_TYPE_ID]: {
    id: COMPANY_TYPE_ID,
    detailFieldSet: PROJECT_DETAIL_FIELD_SETS.COMPANY,
  },
  [PRIVATE_TYPE_ID]: {
    id: PRIVATE_TYPE_ID,
    detailFieldSet: PROJECT_DETAIL_FIELD_SETS.PRIVATE_CLIENT,
  },
};

const COMPANY_DETAILS = {
  customerPhone: '052-4418230',
  customerName: 'בבלי נדל״ן בע״מ',
  customerCompanyNumber: '514287937',
  customerEmail: 'office@babli-re.co.il',
  customerAddress: 'דרך נמיר 94, תל אביב',
};

const STORED_COMPANY_PROJECT = {
  ...COMPANY_DETAILS,
  id: PROJECT_ID,
  customerCity: null,
  customerUnit: null,
  customerFloor: null,
  stageId: QUOTE_STAGE_ID,
  customerApartment: null,
  projectTypeId: COMPANY_TYPE_ID,
  customerAssociationNumber: null,
};

const LEGACY_PROJECT = {
  id: PROJECT_ID,
  customerName: null,
  customerCity: null,
  customerUnit: null,
  customerFloor: null,
  customerPhone: null,
  customerEmail: null,
  customerAddress: null,
  stageId: QUOTE_STAGE_ID,
  customerApartment: null,
  customerCompanyNumber: null,
  projectTypeId: COMPANY_TYPE_ID,
  customerAssociationNumber: null,
};

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
    update: jest
      .fn<Promise<boolean>, [string, TProjectUpdateAttributes, object]>()
      .mockResolvedValue(true),
    isCodeTaken: jest.fn().mockResolvedValue(false),
    findById: jest.fn().mockResolvedValue(STORED_COMPANY_PROJECT),
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
  const projectTypeService = {
    getById: jest.fn((id: keyof typeof PROJECT_TYPES) =>
      Promise.resolve(PROJECT_TYPES[id]),
    ),
  };
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
      { provide: ProjectTypeService, useValue: projectTypeService },
    ],
  }).compile();

  return {
    service: moduleRef.get(ProjectService),
    eventEmitter,
    projectRepository,
    transitionService,
    projectTypeService,
    projectMemberService,
  };
};

describe('ProjectService.create', () => {
  const PROJECT = {
    ...COMPANY_DETAILS,
    name: 'מגדל פארק בבלי C',
    projectTypeId: COMPANY_TYPE_ID,
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

describe('ProjectService.create customer details', () => {
  const PROJECT = {
    ...COMPANY_DETAILS,
    members: [],
    name: 'מגדל פארק בבלי C',
    projectTypeId: COMPANY_TYPE_ID,
  };

  it('stores the field set of the project type and clears fields that belong to other types', async () => {
    const { service, projectRepository } = await createService();

    await service.create(
      { ...PROJECT, customerCity: 'חיפה', customerFloor: 3 },
      CREATOR,
    );

    const [createdAttributes] = projectRepository.create.mock.calls[0];

    expect(createdAttributes).toMatchObject({
      ...COMPANY_DETAILS,
      customerCity: null,
      customerFloor: null,
      customerAssociationNumber: null,
    });
  });

  it('rejects a project missing a field its type requires, naming the field', async () => {
    const { service, projectRepository } = await createService();

    await expect(
      service.create({ ...PROJECT, customerCompanyNumber: null }, CREATOR),
    ).rejects.toThrow(
      new BadRequestException(
        'Missing customer details for this project type: customerCompanyNumber',
      ),
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

describe('ProjectService.update customer details', () => {
  const PRIVATE_ONLY_DETAILS = {
    customerFloor: 7,
    customerApartment: '24',
    customerCity: 'תל אביב-יפו',
  };

  it('keeps legacy projects editable when neither the type nor the details change', async () => {
    const { service, projectRepository, projectTypeService } =
      await createService();
    projectRepository.findById.mockResolvedValue(LEGACY_PROJECT);

    await service.update(PROJECT_ID, { name: 'שם חדש' }, CREATOR);

    const [, updatedAttributes] = projectRepository.update.mock.calls[0];

    expect(projectTypeService.getById).not.toHaveBeenCalled();
    expect(updatedAttributes).toMatchObject({ name: 'שם חדש' });
    expect(updatedAttributes).not.toHaveProperty('customerName');
  });

  it('requires the complete field set once a legacy project edits its details', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(LEGACY_PROJECT);

    await expect(
      service.update(PROJECT_ID, { customerName: 'בבלי' }, CREATOR),
    ).rejects.toThrow(BadRequestException);
    expect(projectRepository.update).not.toHaveBeenCalled();
  });

  it('carries shared fields over a type switch and asks only for the new ones', async () => {
    const { service, projectRepository } = await createService();

    await expect(
      service.update(PROJECT_ID, { projectTypeId: PRIVATE_TYPE_ID }, CREATOR),
    ).rejects.toThrow(
      new BadRequestException(
        'Missing customer details for this project type: customerCity, customerFloor, customerApartment',
      ),
    );
    expect(projectRepository.update).not.toHaveBeenCalled();
  });

  it('switches type with the new fields, keeping shared values and clearing the company number', async () => {
    const { service, projectRepository } = await createService();

    await service.update(
      PROJECT_ID,
      { ...PRIVATE_ONLY_DETAILS, projectTypeId: PRIVATE_TYPE_ID },
      CREATOR,
    );

    expect(projectRepository.update).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({
        ...PRIVATE_ONLY_DETAILS,
        customerCompanyNumber: null,
        projectTypeId: PRIVATE_TYPE_ID,
        customerName: COMPANY_DETAILS.customerName,
        customerPhone: COMPANY_DETAILS.customerPhone,
        customerEmail: COMPANY_DETAILS.customerEmail,
        customerAddress: COMPANY_DETAILS.customerAddress,
      }),
      TRANSACTION,
    );
  });

  it('rejects clearing a required field', async () => {
    const { service } = await createService();

    await expect(
      service.update(PROJECT_ID, { customerPhone: null }, CREATOR),
    ).rejects.toThrow(
      new BadRequestException(
        'Missing customer details for this project type: customerPhone',
      ),
    );
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
