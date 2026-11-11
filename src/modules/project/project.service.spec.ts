import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  TProjectUpdateAttributes,
  TProjectCreationAttributes,
} from './interfaces/project.interface';

import {
  PROJECT_STATUS_IDS,
  ARCHIVED_PROJECT_STATUS_IDS,
  WAITING_REASON_SOURCE_STATUS_IDS,
} from '@Constants/project-status.constant';

import {
  TNoteByProjectId,
  ITargetStageNoteQuery,
} from '@Modules/project-stage-transition/interfaces/project-stage-transition.interface';

import { Test } from '@nestjs/testing';
import { ProjectService } from './project.service';
import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProjectRepository } from './project.repository';
import { USER_ROLES } from '@Constants/user-role.constant';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ProjectIntakeService } from './project-intake.service';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { AddressService } from '@Modules/address/address.service';
import { DOMAIN_EVENTS } from '@Constants/domain-events.constant';
import { CURSOR_DIRECTIONS } from '@Constants/pagination.constant';
import { authorizedUser } from '../../testing/authorization.fixture';
import { CustomerService } from '@Modules/customer/customer.service';
import { ProjectApartmentService } from './project-apartment.service';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { APARTMENT_OWNERSHIP } from './constants/apartment-commercial.constant';
import { ProjectTypeService } from '@Modules/project-type/project-type.service';
import { ProjectStageService } from '@Modules/project-stage/project-stage.service';
import { ProjectMemberService } from '@Modules/project-member/project-member.service';
import { PARAN_JERUSALEM_PLACE } from '@Modules/address/testing/paran-jerusalem.fixture';
import { ProjectTaskInitializationService } from './project-task-initialization.service';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { ProjectStageTransitionService } from '@Modules/project-stage-transition/project-stage-transition.service';

const TRANSACTION = { id: 'transaction' };
const PROJECT_ID = 'project-1';
const QUOTE_STAGE_ID = 'stage-quote';
const DRAFT_STAGE_ID = PROJECT_STATUS_IDS.NOT_STARTED;
const ORDER_STAGE_ID = 'stage-order';
const COMPANY_TYPE_ID = 'type-company';
const PRIVATE_TYPE_ID = 'type-private';
const BUILDING_TYPE_ID = 'type-building';
const CUSTOMER_ID = 'customer-1';
const WAITING_STAGE_ID = PROJECT_STATUS_IDS.WAITING_FOR_RESPONSE;

const waitingReasonRequired = {
  response: { code: HTTP_ERROR_CODES.WAITING_REASON_REQUIRED },
};

const LINKED_CUSTOMER = {
  name: 'בבלי נדל״ן',
  prioritySyncStatus: 'synced',
};

const PROJECT_TYPES = {
  [COMPANY_TYPE_ID]: {
    id: COMPANY_TYPE_ID,
    name: 'מסחרי',
    canHaveApartments: false,
    detailFieldSet: PROJECT_DETAIL_FIELD_SETS.COMPANY,
  },
  [PRIVATE_TYPE_ID]: {
    id: PRIVATE_TYPE_ID,
    name: 'לקוחות פרטיים',
    canHaveApartments: false,
    detailFieldSet: PROJECT_DETAIL_FIELD_SETS.PRIVATE_CLIENT,
  },
  [BUILDING_TYPE_ID]: {
    id: BUILDING_TYPE_ID,
    name: 'בנייה רוויה',
    canHaveApartments: true,
    detailFieldSet: PROJECT_DETAIL_FIELD_SETS.COMPANY,
  },
};

const COMPANY_DETAILS = {
  customerPhone: '052-4418230',
  customerName: 'בבלי נדל״ן בע״מ',
  customerCompanyNumber: '514287937',
  customerEmail: 'office@babli-re.co.il',
  customerAddress: 'דרך נמיר 94, תל אביב',
};

const TEL_AVIV_PLACE_ID = 'ChIJ-tel-aviv' as const;
const PARAN_PLACE_ID = PARAN_JERUSALEM_PLACE.id;
const ROAD_PLACE_ID = 'ChIJ-road-without-city' as const;
const UNKNOWN_PLACE_ID = 'ChIJ-unknown' as const;

const VERIFIED_ADDRESSES = {
  [TEL_AVIV_PLACE_ID]: {
    countryCode: 'IL',
    city: 'תל אביב-יפו',
    placeId: TEL_AVIV_PLACE_ID,
    formattedAddress: 'דרך נמיר 94, תל אביב-יפו',
  },
  [PARAN_PLACE_ID]: {
    city: 'ירושלים',
    countryCode: null,
    placeId: PARAN_PLACE_ID,
    formattedAddress: PARAN_JERUSALEM_PLACE.formattedAddress,
    location: PARAN_JERUSALEM_PLACE.location,
  },
  [ROAD_PLACE_ID]: {
    city: null,
    countryCode: 'IL',
    placeId: ROAD_PLACE_ID,
    formattedAddress: 'כביש 6, ישראל',
  },
};

interface IPlaceLookupFixture {
  placeId: keyof typeof VERIFIED_ADDRESSES | typeof UNKNOWN_PLACE_ID;
}

const CONTACT = {
  contactName: 'דנה לוי',
  contactPhone: '052-7788990',
  contactRole: 'מנהלת פרויקט',
};

const COMPANY_INTAKE = {
  ...CONTACT,
  addressPlaceId: TEL_AVIV_PLACE_ID,
};

const STORED_COMPANY_INTAKE = {
  ...CONTACT,
  addressCity: 'תל אביב-יפו',
  addressPlaceId: TEL_AVIV_PLACE_ID,
  address: 'דרך נמיר 94, תל אביב-יפו',
};

const EMPTY_INTAKE = {
  address: null,
  addressCity: null,
  contactName: null,
  contactRole: null,
  contactPhone: null,
  addressPlaceId: null,
};

const PRIVATE_DETAILS = {
  customerFloor: 7,
  customerName: 'משפחת לוי',
  customerApartment: '24',
  customerCity: 'תל אביב-יפו',
  customerPhone: '052-4418230',
  customerEmail: 'levi@example.co.il',
  customerAddress: 'דרך נמיר 94, תל אביב',
};

const STORED_COMPANY_PROJECT = {
  ...COMPANY_DETAILS,
  id: PROJECT_ID,
  customerId: null,
  parentProjectId: null,
  customerCity: null,
  customerUnit: null,
  customerFloor: null,
  stageId: QUOTE_STAGE_ID,
  customerApartment: null,
  projectTypeId: COMPANY_TYPE_ID,
  customerAssociationNumber: null,
  ...EMPTY_INTAKE,
};

const STORED_INTAKE_PROJECT = {
  ...STORED_COMPANY_PROJECT,
  ...STORED_COMPANY_INTAKE,
};

const LEGACY_PROJECT = {
  id: PROJECT_ID,
  customerId: null,
  parentProjectId: null,
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
  ...EMPTY_INTAKE,
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
    countByFilter: jest.fn().mockResolvedValue(0),
    countLiveApartments: jest.fn().mockResolvedValue(0),
    softDelete: jest.fn().mockResolvedValue(true),
    findLiveApartmentByNumber: jest.fn().mockResolvedValue(null),
    countApartmentsEverCreated: jest.fn().mockResolvedValue(0),
    findByFilter: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
  };
  const customerService = {
    findById: jest.fn().mockResolvedValue(LINKED_CUSTOMER),
  };
  const projectStageService = {
    getById: jest.fn().mockResolvedValue({ id: ORDER_STAGE_ID }),
    getInitialStage: jest.fn().mockResolvedValue({ id: DRAFT_STAGE_ID }),
  };
  const projectMemberService = {
    replaceForProject: jest.fn().mockResolvedValue(null),
    replaceApartmentTeam: jest.fn().mockResolvedValue(null),
    setApartmentEngineer: jest.fn().mockResolvedValue(null),
    validateAssignments: jest.fn().mockResolvedValue(null),
  };
  const transitionService = {
    record: jest.fn().mockResolvedValue(null),
    findLatestNotesByTargetStages: jest
      .fn<Promise<TNoteByProjectId>, [ITargetStageNoteQuery]>()
      .mockResolvedValue(new Map()),
  };
  const taskInitialization = {
    ensureForProject: jest.fn().mockResolvedValue(null),
  };
  const projectTypeService = {
    getById: jest.fn((id: keyof typeof PROJECT_TYPES) =>
      Promise.resolve(PROJECT_TYPES[id]),
    ),
  };
  const addressService = {
    getVerifiedAddress: jest.fn(({ placeId }: IPlaceLookupFixture) => {
      if (placeId === UNKNOWN_PLACE_ID) {
        return Promise.reject(new NotFoundException('Place was not found'));
      }

      return Promise.resolve(VERIFIED_ADDRESSES[placeId]);
    }),
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
      ProjectIntakeService,
      ProjectApartmentService,
      {
        provide: ProjectTaskInitializationService,
        useValue: taskInitialization,
      },
      { provide: CustomerService, useValue: customerService },
      { provide: AddressService, useValue: addressService },
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
    customerService,
    addressService,
    projectRepository,
    transitionService,
    taskInitialization,
    projectTypeService,
    projectMemberService,
  };
};

describe('ProjectService.create', () => {
  const PROJECT = {
    ...COMPANY_DETAILS,
    ...COMPANY_INTAKE,
    customerId: CUSTOMER_ID,
    name: 'מגדל פארק בבלי C',
    projectTypeId: COMPANY_TYPE_ID,
    members: [{ userId: 'user-2', role: USER_ROLES.SECRETARY }],
  };

  it('creates the project in Draft with its members, mandatory tasks and an opening timeline entry', async () => {
    const {
      service,
      projectRepository,
      projectMemberService,
      transitionService,
      taskInitialization,
    } = await createService();

    await service.create(PROJECT, CREATOR);

    const [createdAttributes, transaction] =
      projectRepository.create.mock.calls[0];

    expect(transaction).toBe(TRANSACTION);
    expect(createdAttributes.code).toMatch(/^אכ-[0-9]{5}$/);
    expect(createdAttributes).toMatchObject({
      stageId: DRAFT_STAGE_ID,
      createdById: CREATOR.id,
    });
    expect(projectMemberService.replaceForProject).toHaveBeenCalledWith(
      PROJECT_ID,
      PROJECT.members,
      TRANSACTION,
    );
    expect(transitionService.record).toHaveBeenCalledWith(
      expect.objectContaining({ fromStageId: null, toStageId: DRAFT_STAGE_ID }),
      TRANSACTION,
    );
    expect(taskInitialization.ensureForProject).toHaveBeenCalledWith(
      { id: PROJECT_ID, name: PROJECT.name },
      CREATOR,
      TRANSACTION,
    );
  });

  it('does not publish a project when mandatory task initialization fails', async () => {
    const { service, taskInitialization, eventEmitter } = await createService();
    taskInitialization.ensureForProject.mockRejectedValue(
      new Error('task write failed'),
    );
    await expect(service.create(PROJECT, CREATOR)).rejects.toThrow(
      'task write failed',
    );
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
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

describe('ProjectService.create site details', () => {
  const PROJECT = {
    ...COMPANY_DETAILS,
    ...COMPANY_INTAKE,
    members: [],
    customerId: CUSTOMER_ID,
    name: 'מגדל פארק בבלי C',
    projectTypeId: COMPANY_TYPE_ID,
  };

  it('stores no typed customer identity, since the linked customer holds it', async () => {
    const { service, projectRepository } = await createService();

    await service.create(
      { ...PROJECT, customerCity: 'חיפה', customerFloor: 3 },
      CREATOR,
    );

    const [createdAttributes] = projectRepository.create.mock.calls[0];

    expect(createdAttributes).toMatchObject({
      customerId: CUSTOMER_ID,
      customerName: null,
      customerCity: null,
      customerFloor: null,
      customerPhone: null,
      customerCompanyNumber: null,
    });
  });

  it('rejects a private project missing its floor and apartment, naming them', async () => {
    const { service, projectRepository } = await createService();

    await expect(
      service.create({ ...PROJECT, projectTypeId: PRIVATE_TYPE_ID }, CREATOR),
    ).rejects.toThrow(
      new BadRequestException(
        'Missing site details for this project type: customerFloor, customerApartment',
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

describe('ProjectService.move waiting reason', () => {
  it.each([
    ['missing', {}],
    ['empty', { note: '' }],
    ['whitespace', { note: '   ' }],
  ])(
    'rejects moving to waiting with a %s reason before any write',
    async (_case, reason) => {
      const { service, projectRepository, transitionService } =
        await createService();

      const move = service.move(
        PROJECT_ID,
        { stageId: WAITING_STAGE_ID, ...reason },
        CREATOR,
      );

      await expect(move).rejects.toBeInstanceOf(BadRequestException);
      await expect(move).rejects.toMatchObject(waitingReasonRequired);
      expect(projectRepository.update).not.toHaveBeenCalled();
      expect(transitionService.record).not.toHaveBeenCalled();
    },
  );

  it('stores the reason on the waiting transition', async () => {
    const { service, projectRepository, transitionService } =
      await createService();

    await service.move(
      PROJECT_ID,
      { stageId: WAITING_STAGE_ID, note: 'ממתינים לאישור הלקוח' },
      CREATOR,
    );

    expect(projectRepository.update).toHaveBeenCalledWith(
      PROJECT_ID,
      { stageId: WAITING_STAGE_ID },
      TRANSACTION,
    );
    expect(transitionService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        toStageId: WAITING_STAGE_ID,
        note: 'ממתינים לאישור הלקוח',
      }),
      TRANSACTION,
    );
  });

  it('keeps the note optional for other statuses and stores a blank one as null', async () => {
    const { service, transitionService } = await createService();

    await service.move(
      PROJECT_ID,
      { stageId: PROJECT_STATUS_IDS.COMPLETED, note: '' },
      CREATOR,
    );

    expect(transitionService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        note: null,
        toStageId: PROJECT_STATUS_IDS.COMPLETED,
      }),
      TRANSACTION,
    );
  });

  it('does not ask for a reason when the project is already waiting', async () => {
    const { service, projectRepository, transitionService } =
      await createService();
    projectRepository.findById.mockResolvedValue({
      ...STORED_COMPANY_PROJECT,
      stageId: WAITING_STAGE_ID,
    });

    await service.move(PROJECT_ID, { stageId: WAITING_STAGE_ID }, CREATOR);

    expect(projectRepository.update).not.toHaveBeenCalled();
    expect(transitionService.record).not.toHaveBeenCalled();
  });
});

describe('ProjectService.update waiting reason', () => {
  it.each([
    ['missing', {}],
    ['empty', { stageNote: '' }],
    ['whitespace', { stageNote: '   ' }],
  ])(
    'rejects updating into waiting with a %s stageNote before any write',
    async (_case, reason) => {
      const { service, projectRepository, transitionService } =
        await createService();
      const update = service.update(
        PROJECT_ID,
        { stageId: WAITING_STAGE_ID, ...reason },
        CREATOR,
      );

      await expect(update).rejects.toBeInstanceOf(BadRequestException);
      await expect(update).rejects.toMatchObject(waitingReasonRequired);
      expect(projectRepository.update).not.toHaveBeenCalled();
      expect(transitionService.record).not.toHaveBeenCalled();
    },
  );

  it('records the stageNote when updating into waiting', async () => {
    const { service, projectRepository, transitionService } =
      await createService();

    await service.update(
      PROJECT_ID,
      { stageId: WAITING_STAGE_ID, stageNote: 'ממתינים לחתימה' },
      CREATOR,
    );

    expect(projectRepository.update).toHaveBeenCalledWith(
      PROJECT_ID,
      { stageId: WAITING_STAGE_ID },
      TRANSACTION,
    );
    expect(transitionService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        changedBy: CREATOR,
        toStageId: WAITING_STAGE_ID,
        note: 'ממתינים לחתימה',
      }),
      TRANSACTION,
    );
  });

  it('keeps stageNote optional when updating into another status', async () => {
    const { service, transitionService } = await createService();

    await service.update(
      PROJECT_ID,
      { stageId: PROJECT_STATUS_IDS.COMPLETED },
      CREATOR,
    );

    expect(transitionService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        note: null,
        toStageId: PROJECT_STATUS_IDS.COMPLETED,
      }),
      TRANSACTION,
    );
  });

  it('ignores a stageNote when the stage does not change', async () => {
    const { service, projectRepository, transitionService } =
      await createService();
    projectRepository.findById.mockResolvedValue({
      ...STORED_COMPANY_PROJECT,
      stageId: WAITING_STAGE_ID,
    });

    await service.update(
      PROJECT_ID,
      { stageId: WAITING_STAGE_ID, stageNote: '' },
      CREATOR,
    );
    await service.update(PROJECT_ID, { stageNote: 'סיבה' }, CREATOR);

    expect(transitionService.record).not.toHaveBeenCalled();
  });
});

describe('ProjectService waiting reason reads', () => {
  const WAITING_PROJECT = {
    ...STORED_COMPANY_PROJECT,
    stageId: WAITING_STAGE_ID,
  };

  it('exposes the latest waiting reason of a waiting project', async () => {
    const { service, projectRepository, transitionService } =
      await createService();
    projectRepository.findById.mockResolvedValue(WAITING_PROJECT);
    transitionService.findLatestNotesByTargetStages.mockResolvedValue(
      new Map([[PROJECT_ID, 'ממתינים לתוכניות']]),
    );

    await expect(service.getById(PROJECT_ID)).resolves.toMatchObject({
      waitingReason: 'ממתינים לתוכניות',
    });
    expect(
      transitionService.findLatestNotesByTargetStages,
    ).toHaveBeenCalledWith({
      projectIds: [PROJECT_ID],
      toStageIds: WAITING_REASON_SOURCE_STATUS_IDS,
    });
  });

  it('exposes the archived On Hold reason of a migration-remapped waiting project', async () => {
    const { service, projectRepository, transitionService } =
      await createService();
    projectRepository.findById.mockResolvedValue(WAITING_PROJECT);
    transitionService.findLatestNotesByTargetStages.mockResolvedValue(
      new Map([[PROJECT_ID, 'סיבה מלהמתין']]),
    );

    await expect(service.getById(PROJECT_ID)).resolves.toMatchObject({
      waitingReason: 'סיבה מלהמתין',
    });
    expect(WAITING_REASON_SOURCE_STATUS_IDS).toEqual([
      PROJECT_STATUS_IDS.WAITING_FOR_RESPONSE,
      ARCHIVED_PROJECT_STATUS_IDS.ON_HOLD,
    ]);
  });

  it('exposes null for a project that is not waiting, even with an old waiting note', async () => {
    const { service, transitionService } = await createService();
    transitionService.findLatestNotesByTargetStages.mockImplementation(
      ({ projectIds }) =>
        Promise.resolve(new Map(projectIds.map((id) => [id, 'סיבה ישנה']))),
    );

    await expect(service.getById(PROJECT_ID)).resolves.toMatchObject({
      waitingReason: null,
    });
    expect(
      transitionService.findLatestNotesByTargetStages,
    ).toHaveBeenCalledWith({
      projectIds: [],
      toStageIds: WAITING_REASON_SOURCE_STATUS_IDS,
    });
  });

  it('returns null after the project moves out of waiting', async () => {
    const { service, projectRepository, transitionService } =
      await createService();
    projectRepository.findById
      .mockResolvedValueOnce(WAITING_PROJECT)
      .mockResolvedValue({
        ...STORED_COMPANY_PROJECT,
        stageId: PROJECT_STATUS_IDS.IN_PROGRESS,
      });

    const moved = await service.move(
      PROJECT_ID,
      { stageId: PROJECT_STATUS_IDS.IN_PROGRESS },
      CREATOR,
    );

    expect(moved.waitingReason).toBeNull();
    expect(
      transitionService.findLatestNotesByTargetStages,
    ).toHaveBeenLastCalledWith({
      projectIds: [],
      toStageIds: WAITING_REASON_SOURCE_STATUS_IDS,
    });
  });

  it('exposes reasons on the board list only for waiting projects', async () => {
    const { service, projectRepository, transitionService } =
      await createService();
    const otherProjectId = 'project-2';
    projectRepository.findByFilter.mockResolvedValue({
      items: [
        WAITING_PROJECT,
        { ...STORED_COMPANY_PROJECT, id: otherProjectId },
      ],
      nextCursor: 'cursor',
    });
    transitionService.findLatestNotesByTargetStages.mockResolvedValue(
      new Map([[PROJECT_ID, 'ממתינים להצעת מחיר']]),
    );

    const page = await service.getByFilter({});

    expect(page.nextCursor).toBe('cursor');
    expect(page.items.map((item) => item.waitingReason)).toEqual([
      'ממתינים להצעת מחיר',
      null,
    ]);
    expect(
      transitionService.findLatestNotesByTargetStages,
    ).toHaveBeenCalledWith({
      projectIds: [PROJECT_ID],
      toStageIds: WAITING_REASON_SOURCE_STATUS_IDS,
    });
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

describe('ProjectService.update site details', () => {
  const SITE_DETAILS = { customerFloor: 7, customerApartment: '24' };

  const STORED_PRIVATE_PROJECT = {
    ...STORED_COMPANY_PROJECT,
    ...SITE_DETAILS,
    projectTypeId: PRIVATE_TYPE_ID,
  };

  it('keeps legacy projects editable when neither the type nor the details change', async () => {
    const { service, projectRepository, projectTypeService } =
      await createService();
    projectRepository.findById.mockResolvedValue(LEGACY_PROJECT);

    await service.update(PROJECT_ID, { name: 'שם חדש' }, CREATOR);

    const [, updatedAttributes] = projectRepository.update.mock.calls[0];

    expect(projectTypeService.getById).toHaveBeenCalledWith(
      LEGACY_PROJECT.projectTypeId,
    );
    expect(updatedAttributes).toMatchObject({ name: 'שם חדש' });
    expect(updatedAttributes).not.toHaveProperty('customerName');
  });

  it('asks for the site details of the new type on a type switch', async () => {
    const { service, projectRepository } = await createService();

    await expect(
      service.update(PROJECT_ID, { projectTypeId: PRIVATE_TYPE_ID }, CREATOR),
    ).rejects.toThrow(
      new BadRequestException(
        'Missing site details for this project type: customerFloor, customerApartment',
      ),
    );
    expect(projectRepository.update).not.toHaveBeenCalled();
  });

  it('switches type with the new site details and clears the typed customer identity', async () => {
    const { service, projectRepository } = await createService();

    await service.update(
      PROJECT_ID,
      { ...SITE_DETAILS, projectTypeId: PRIVATE_TYPE_ID },
      CREATOR,
    );

    expect(projectRepository.update).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({
        ...SITE_DETAILS,
        customerName: null,
        customerPhone: null,
        customerCompanyNumber: null,
        projectTypeId: PRIVATE_TYPE_ID,
      }),
      TRANSACTION,
    );
  });

  it('rejects clearing a required site field', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(STORED_PRIVATE_PROJECT);

    await expect(
      service.update(PROJECT_ID, { customerFloor: null }, CREATOR),
    ).rejects.toThrow(
      new BadRequestException(
        'Missing site details for this project type: customerFloor',
      ),
    );
  });
});

describe('ProjectService.create intake fields', () => {
  const PROJECT = {
    ...COMPANY_DETAILS,
    ...COMPANY_INTAKE,
    members: [],
    customerId: CUSTOMER_ID,
    name: 'מגדל פארק בבלי C',
    projectTypeId: COMPANY_TYPE_ID,
  };

  const PRIVATE_PROJECT = {
    ...PRIVATE_DETAILS,
    ...CONTACT,
    members: [],
    customerId: CUSTOMER_ID,
    name: 'דירת משפחת לוי',
    projectTypeId: PRIVATE_TYPE_ID,
    addressPlaceId: TEL_AVIV_PLACE_ID,
  };

  const expectRejection = async (
    project: Parameters<ProjectService['create']>[0],
    message: string,
  ) => {
    const { service, projectRepository } = await createService();

    await expect(service.create(project, CREATOR)).rejects.toThrow(
      new BadRequestException(message),
    );
    expect(projectRepository.create).not.toHaveBeenCalled();
  };

  it('stores verified site address and payment terms without duplicating customer contacts', async () => {
    const { service, projectRepository, addressService } =
      await createService();

    await service.create(PROJECT, CREATOR);

    const [createdAttributes] = projectRepository.create.mock.calls[0];

    expect(addressService.getVerifiedAddress).toHaveBeenCalledWith({
      sessionToken: null,
      placeId: TEL_AVIV_PLACE_ID,
    });
    expect(createdAttributes).toMatchObject({
      ...STORED_COMPANY_INTAKE,
      contactName: null,
      contactPhone: null,
      contactRole: null,
    });
  });

  it('stores the selected verified Paran 1 place ID and Jerusalem address', async () => {
    const { service, projectRepository } = await createService();

    await service.create(
      { ...PROJECT, addressPlaceId: PARAN_PLACE_ID },
      CREATOR,
    );

    expect(projectRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        addressPlaceId: PARAN_PLACE_ID,
        addressCity: 'ירושלים',
        address: 'פארן 1, ירושלים',
      }),
      TRANSACTION,
    );
  });

  it('rejects a project without an address', async () => {
    await expectRejection(
      { ...PROJECT, addressPlaceId: null },
      'addressPlaceId is required; pick the address from the suggestions',
    );
  });

  it('rejects an address Google cannot verify', async () => {
    await expectRejection(
      { ...PROJECT, addressPlaceId: UNKNOWN_PLACE_ID },
      `Address ${UNKNOWN_PLACE_ID} could not be verified with Google; pick it again from the suggestions`,
    );
  });

  it('requires a city in the address of a private project', async () => {
    await expectRejection(
      { ...PRIVATE_PROJECT, addressPlaceId: ROAD_PLACE_ID },
      'This project type needs an address within a city; pick a street address',
    );
  });

  it('accepts an address without a city for a company project', async () => {
    const { service, projectRepository } = await createService();

    await service.create(
      { ...PROJECT, addressPlaceId: ROAD_PLACE_ID },
      CREATOR,
    );

    const [createdAttributes] = projectRepository.create.mock.calls[0];

    expect(createdAttributes).toMatchObject({
      addressCity: null,
      addressPlaceId: ROAD_PLACE_ID,
    });
  });

  it('creates a project without inline customer-contact inputs', async () => {
    const { service, projectRepository } = await createService();
    const project = { ...PROJECT };
    ['contactName', 'contactPhone', 'contactRole'].forEach((field) =>
      Reflect.deleteProperty(project, field),
    );
    await service.create(project, CREATOR);
    expect(projectRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contactName: null,
        contactPhone: null,
        contactRole: null,
      }),
      TRANSACTION,
    );
  });
});

describe('ProjectService.update intake fields', () => {
  const expectRejection = async (
    changes: Parameters<ProjectService['update']>[1],
    message: string,
  ) => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(STORED_INTAKE_PROJECT);

    await expect(service.update(PROJECT_ID, changes, CREATOR)).rejects.toThrow(
      new BadRequestException(message),
    );
    expect(projectRepository.update).not.toHaveBeenCalled();
  };

  const getUpdatedAttributes = async (
    changes: Parameters<ProjectService['update']>[1],
    storedProject: object = STORED_INTAKE_PROJECT,
  ) => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(storedProject);

    await service.update(PROJECT_ID, changes, CREATOR);

    const [, updatedAttributes] = projectRepository.update.mock.calls[0];

    return updatedAttributes;
  };

  it('lets a legacy project change its name without any intake fields', async () => {
    const updatedAttributes = await getUpdatedAttributes(
      { name: 'שם חדש' },
      STORED_COMPANY_PROJECT,
    );

    expect(updatedAttributes).not.toHaveProperty('contactName');
    expect(updatedAttributes).not.toHaveProperty('addressPlaceId');
  });

  it('ignores old inline contact fields when updating a project', async () => {
    const updatedAttributes = await getUpdatedAttributes({
      contactPhone: '054-1112233',
    });
    expect(updatedAttributes).not.toHaveProperty('contactPhone');
  });

  it('verifies a new address with Google', async () => {
    const updatedAttributes = await getUpdatedAttributes({
      addressPlaceId: ROAD_PLACE_ID,
    });

    expect(updatedAttributes).toMatchObject({
      addressCity: null,
      address: 'כביש 6, ישראל',
      addressPlaceId: ROAD_PLACE_ID,
    });
  });

  it('rejects clearing the address', async () => {
    await expectRejection(
      { addressPlaceId: null },
      'addressPlaceId is required; pick the address from the suggestions',
    );
  });

  it('rejects an unverifiable address', async () => {
    await expectRejection(
      { addressPlaceId: UNKNOWN_PLACE_ID },
      `Address ${UNKNOWN_PLACE_ID} could not be verified with Google; pick it again from the suggestions`,
    );
  });

  it('changes project type without requiring payment terms', async () => {
    const updatedAttributes = await getUpdatedAttributes({
      ...PRIVATE_DETAILS,
      projectTypeId: PRIVATE_TYPE_ID,
    });

    expect(updatedAttributes).toMatchObject({
      projectTypeId: PRIVATE_TYPE_ID,
    });
  });

  it('requires a city in the current address when switching to a private project', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue({
      ...STORED_INTAKE_PROJECT,
      addressCity: null,
      addressPlaceId: ROAD_PLACE_ID,
    });

    await expect(
      service.update(
        PROJECT_ID,
        {
          ...PRIVATE_DETAILS,
          projectTypeId: PRIVATE_TYPE_ID,
        },
        CREATOR,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'This project type needs an address within a city; pick a street address',
      ),
    );
  });

  it('lets a legacy project change its type', async () => {
    const updatedAttributes = await getUpdatedAttributes(
      { ...PRIVATE_DETAILS, projectTypeId: PRIVATE_TYPE_ID },
      STORED_COMPANY_PROJECT,
    );

    expect(updatedAttributes).toMatchObject({ projectTypeId: PRIVATE_TYPE_ID });
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

const BUILDING_ID = 'building-1';

const BUILDING = {
  ...STORED_INTAKE_PROJECT,
  id: BUILDING_ID,
  code: 'GA-84811',
  projectTypeId: BUILDING_TYPE_ID,
  projectType: {
    name: 'בנייה רוויה',
    canHaveApartments: true,
    detailFieldSet: PROJECT_DETAIL_FIELD_SETS.COMPANY,
  },
};

const NEW_APARTMENT = {
  customerId: CUSTOMER_ID,
  customerFloor: 3,
  customerApartment: '12',
};

const STORED_APARTMENT = {
  ...LEGACY_PROJECT,
  ...CONTACT,
  id: 'apartment-1',
  customerFloor: 3,
  customerApartment: '12',
  parentProjectId: BUILDING_ID,
};

describe('ProjectService.createApartment', () => {
  it('creates the apartment with everything the building decides', async () => {
    const { service, projectRepository, eventEmitter, taskInitialization } =
      await createService();
    projectRepository.findById.mockResolvedValueOnce(BUILDING);
    projectRepository.countApartmentsEverCreated.mockResolvedValue(4);

    await service.createApartment(BUILDING_ID, NEW_APARTMENT, CREATOR);

    const [attributes] = projectRepository.create.mock.calls[0];

    expect(attributes).toMatchObject({
      contactName: null,
      contactPhone: null,
      contactRole: null,
      hasOwnTeam: false,
      customerId: CUSTOMER_ID,
      address: null,
      name: 'דירה 12',
      customerFloor: 3,
      addressPlaceId: null,
      code: 'GA-84811-05',
      customerApartment: '12',
      stageId: DRAFT_STAGE_ID,
      customerPhone: null,
      customerName: null,
      parentProjectId: BUILDING_ID,
      projectTypeId: 'type-building',
    });
    expect(taskInitialization.ensureForProject).toHaveBeenCalledWith(
      { id: PROJECT_ID, name: 'דירה 12' },
      CREATOR,
      TRANSACTION,
    );
    expect(eventEmitter.emitAsync).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      DOMAIN_EVENTS.PROJECT_CREATED,
      { projectId: PROJECT_ID },
    );
    expect(projectRepository.create.mock.invocationCallOrder[0]).toBeLessThan(
      eventEmitter.emitAsync.mock.invocationCallOrder[0],
    );
  });

  it('does not announce an apartment whose mandatory task initialization fails', async () => {
    const { service, projectRepository, eventEmitter, taskInitialization } =
      await createService();
    projectRepository.findById.mockResolvedValueOnce(BUILDING);
    taskInitialization.ensureForProject.mockRejectedValue(
      new Error('mandatory task failed'),
    );
    await expect(
      service.createApartment(BUILDING_ID, NEW_APARTMENT, CREATOR),
    ).rejects.toThrow('mandatory task failed');
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('does not announce an apartment whose persistence fails', async () => {
    const { service, projectRepository, eventEmitter } = await createService();
    projectRepository.findById.mockResolvedValueOnce(BUILDING);
    projectRepository.create.mockRejectedValue(new Error('write failed'));

    await expect(
      service.createApartment(BUILDING_ID, NEW_APARTMENT, CREATOR),
    ).rejects.toThrow('write failed');
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('rejects an apartment under a project type that holds no apartments', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValueOnce({
      ...BUILDING,
      projectType: { name: 'מסחרי', canHaveApartments: false },
    });

    await expect(
      service.createApartment(BUILDING_ID, NEW_APARTMENT, CREATOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an apartment under another apartment', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValueOnce({
      ...BUILDING,
      parentProjectId: 'another-building',
    });

    await expect(
      service.createApartment(BUILDING_ID, NEW_APARTMENT, CREATOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an apartment number the building already has', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValueOnce(BUILDING);
    projectRepository.findLiveApartmentByNumber.mockResolvedValue({
      code: 'GA-84811-02',
    });

    await expect(
      service.createApartment(BUILDING_ID, NEW_APARTMENT, CREATOR),
    ).rejects.toThrow(ConflictException);
    expect(projectRepository.create).not.toHaveBeenCalled();
  });
});

describe('ProjectService apartment customer, creation terms and team', () => {
  it('validates and stores the chosen existing customer', async () => {
    const { service, projectRepository, customerService } =
      await createService();
    projectRepository.findById.mockResolvedValueOnce(BUILDING);
    await service.createApartment(BUILDING_ID, NEW_APARTMENT, CREATOR);
    expect(customerService.findById).toHaveBeenCalledWith(CUSTOMER_ID);
    expect(projectRepository.create.mock.calls[0][0].customerId).toBe(
      CUSTOMER_ID,
    );
  });

  it('rejects a missing selected customer before persistence', async () => {
    const { service, projectRepository, customerService } =
      await createService();
    projectRepository.findById.mockResolvedValueOnce(BUILDING);
    customerService.findById.mockResolvedValue(null);
    await expect(
      service.createApartment(BUILDING_ID, NEW_APARTMENT, CREATOR),
    ).rejects.toThrow('Customer customer-1 was not found');
    expect(projectRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a selected customer with failed Priority sync', async () => {
    const { service, projectRepository, customerService } =
      await createService();
    projectRepository.findById.mockResolvedValueOnce(BUILDING);
    customerService.findById.mockResolvedValue({
      ...LINKED_CUSTOMER,
      prioritySyncStatus: 'failed',
    });
    await expect(
      service.createApartment(BUILDING_ID, NEW_APARTMENT, CREATOR),
    ).rejects.toThrow('has not reached Priority yet');
    expect(projectRepository.create).not.toHaveBeenCalled();
  });

  it.each(['pending', 'synced'])(
    'allows a linkable customer with %s sync status',
    async (prioritySyncStatus) => {
      const { service, projectRepository, customerService } =
        await createService();
      projectRepository.findById.mockResolvedValueOnce(BUILDING);
      customerService.findById.mockResolvedValue({
        ...LINKED_CUSTOMER,
        prioritySyncStatus,
      });
      await service.createApartment(BUILDING_ID, NEW_APARTMENT, CREATOR);
      expect(projectRepository.create).toHaveBeenCalledTimes(1);
    },
  );

  it('distinguishes inheritance from an explicitly empty own team', async () => {
    const inherited = await createService();
    inherited.projectRepository.findById.mockResolvedValueOnce(BUILDING);
    await inherited.service.createApartment(
      BUILDING_ID,
      NEW_APARTMENT,
      CREATOR,
    );
    expect(inherited.projectRepository.create.mock.calls[0][0].hasOwnTeam).toBe(
      false,
    );
    const own = await createService();
    own.projectRepository.findById.mockResolvedValueOnce(BUILDING);
    await own.service.createApartment(
      BUILDING_ID,
      { ...NEW_APARTMENT, members: [] },
      CREATOR,
    );
    expect(own.projectRepository.create.mock.calls[0][0].hasOwnTeam).toBe(true);
    expect(own.projectMemberService.replaceForProject).toHaveBeenCalledWith(
      PROJECT_ID,
      [],
      TRANSACTION,
    );
  });

  it('persists a creation-time team override and validates its assignments', async () => {
    const { service, projectRepository, projectMemberService } =
      await createService();
    const members = [{ userId: 'secretary-1', role: USER_ROLES.SECRETARY }];
    projectRepository.findById.mockResolvedValueOnce(BUILDING);
    await service.createApartment(
      BUILDING_ID,
      { ...NEW_APARTMENT, members },
      CREATOR,
    );
    expect(projectMemberService.validateAssignments).toHaveBeenCalledWith(
      members,
    );
    expect(projectMemberService.replaceForProject).toHaveBeenCalledWith(
      PROJECT_ID,
      members,
      TRANSACTION,
    );
    expect(projectRepository.create.mock.calls[0][0].hasOwnTeam).toBe(true);
  });

  it('reports the duplicate apartment number with the Hebrew design message', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValueOnce(BUILDING);
    projectRepository.findLiveApartmentByNumber.mockResolvedValue({
      code: 'old-apartment',
    });
    await expect(
      service.createApartment(BUILDING_ID, NEW_APARTMENT, CREATOR),
    ).rejects.toThrow('דירה 12 כבר קיימת בבניין');
  });
});

describe('ProjectService.getApartments', () => {
  it('pages the building apartments 25 at a time, oldest first, with the total', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValueOnce(BUILDING);
    projectRepository.countByFilter.mockResolvedValue(73);

    const page = await service.getApartments(BUILDING_ID, { search: '12' });

    expect(page.total).toBe(73);
    expect(projectRepository.findByFilter).toHaveBeenCalledWith(
      expect.objectContaining({ parentProjectId: BUILDING_ID, search: '12' }),
      {
        batchCursor: null,
        batchSize: 25,
        direction: CURSOR_DIRECTIONS.OLDEST_FIRST,
      },
    );
  });
});

describe('ProjectService.getByFilter', () => {
  it('lists buildings and standalone projects only', async () => {
    const { service, projectRepository } = await createService();

    await service.getByFilter({});

    expect(projectRepository.findByFilter).toHaveBeenCalledWith(
      expect.objectContaining({ parentProjectId: null }),
      expect.anything(),
    );
  });
});

describe('ProjectService.update apartment', () => {
  it('rejects fields the apartment takes from its building, naming them', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);

    await expect(
      service.update(
        STORED_APARTMENT.id,
        {
          addressPlaceId: TEL_AVIV_PLACE_ID,
          projectTypeId: PRIVATE_TYPE_ID,
          customerId: 'customer-1',
        },
        CREATOR,
      ),
    ).rejects.toThrow('addressPlaceId, projectTypeId, customerId');
    expect(projectRepository.update).not.toHaveBeenCalled();
  });

  it('moves an apartment into waiting through a generic update with its stageNote', async () => {
    const { service, projectRepository, transitionService } =
      await createService();
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);

    await service.update(
      STORED_APARTMENT.id,
      { stageId: WAITING_STAGE_ID, stageNote: 'ממתינים לבעל הדירה' },
      CREATOR,
    );

    expect(transitionService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: STORED_APARTMENT.id,
        toStageId: WAITING_STAGE_ID,
        note: 'ממתינים לבעל הדירה',
      }),
      TRANSACTION,
    );
  });

  it('rejects a generic update moving an apartment into waiting without a stageNote', async () => {
    const { service, projectRepository, transitionService } =
      await createService();
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);

    await expect(
      service.update(
        STORED_APARTMENT.id,
        { stageId: WAITING_STAGE_ID },
        CREATOR,
      ),
    ).rejects.toMatchObject(waitingReasonRequired);
    expect(projectRepository.update).not.toHaveBeenCalled();
    expect(transitionService.record).not.toHaveBeenCalled();
  });

  it('updates the end customer without asking for building fields', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);

    await service.update(
      STORED_APARTMENT.id,
      { customerName: 'משפחת לוי' },
      CREATOR,
    );

    expect(projectRepository.update.mock.calls[0][1]).toMatchObject({
      customerFloor: 3,
      customerApartment: '12',
      customerName: 'משפחת לוי',
    });
  });

  it('rejects clearing the floor', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);

    await expect(
      service.update(STORED_APARTMENT.id, { customerFloor: null }, CREATOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects moving to an apartment number the building already has', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);
    projectRepository.findLiveApartmentByNumber.mockResolvedValue({
      code: 'GA-84811-07',
    });

    await expect(
      service.update(STORED_APARTMENT.id, { customerApartment: '14' }, CREATOR),
    ).rejects.toThrow(ConflictException);
  });
});

describe('ProjectService customer link', () => {
  const PROJECT = {
    ...COMPANY_DETAILS,
    ...COMPANY_INTAKE,
    members: [],
    customerId: CUSTOMER_ID,
    name: 'מגדל פארק בבלי C',
    projectTypeId: COMPANY_TYPE_ID,
  };

  it('rejects a customer that does not exist', async () => {
    const { service, customerService } = await createService();
    customerService.findById.mockResolvedValue(null);

    await expect(service.create(PROJECT, CREATOR)).rejects.toThrow(
      'Customer customer-1 was not found',
    );
  });

  it('rejects a customer whose Priority sync failed', async () => {
    const { service, customerService } = await createService();
    customerService.findById.mockResolvedValue({
      name: 'עמותת אור',
      prioritySyncStatus: 'failed',
    });

    await expect(service.create(PROJECT, CREATOR)).rejects.toThrow(
      'has not reached Priority yet',
    );
  });

  it('links a customer that is still waiting for Priority', async () => {
    const { service, customerService, projectRepository } =
      await createService();
    customerService.findById.mockResolvedValue({
      name: 'בבלי נדל״ן',
      prioritySyncStatus: 'pending',
    });

    await service.create(PROJECT, CREATOR);

    expect(projectRepository.create.mock.calls[0][0].customerId).toBe(
      CUSTOMER_ID,
    );
  });
});

describe('ProjectService building guards', () => {
  it('removes a standalone engineer before converting to a residential building', async () => {
    const { service, projectRepository, projectMemberService } =
      await createService();
    projectRepository.findById.mockResolvedValue({
      ...STORED_INTAKE_PROJECT,
      projectType: PROJECT_TYPES[COMPANY_TYPE_ID],
      members: [{ userId: 'engineer-1', role: USER_ROLES.ENGINEER }],
    });

    await service.update(
      PROJECT_ID,
      { projectTypeId: BUILDING_TYPE_ID, members: [] },
      CREATOR,
    );

    expect(projectMemberService.replaceForProject).toHaveBeenCalledWith(
      PROJECT_ID,
      [],
      TRANSACTION,
    );
    expect(
      projectMemberService.replaceForProject.mock.invocationCallOrder[0],
    ).toBeLessThan(projectRepository.update.mock.invocationCallOrder[0]);
  });

  it('refuses to delete a building that still has apartments', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.countLiveApartments.mockResolvedValue(3);

    await expect(service.delete(BUILDING_ID)).rejects.toThrow(
      ConflictException,
    );
    expect(projectRepository.softDelete).not.toHaveBeenCalled();
  });

  it('refuses to change a building with apartments to a type without apartments', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(BUILDING);
    projectRepository.countLiveApartments.mockResolvedValue(3);

    await expect(
      service.update(BUILDING_ID, { projectTypeId: PRIVATE_TYPE_ID }, CREATOR),
    ).rejects.toThrow('cannot hold apartments');
  });
});

const BUILDING_INHERITANCE = {
  id: BUILDING_ID,
  code: 'GA-84811',
  name: 'מגדלי שלום',
  notes: 'תמ״א 38: חיזוק קומה 4 לפני התקנת יחידות',
  address: STORED_COMPANY_INTAKE.address,
  addressCity: STORED_COMPANY_INTAKE.addressCity,
  addressPlaceId: STORED_COMPANY_INTAKE.addressPlaceId,
};

const APARTMENT_WITH_BUILDING = {
  ...STORED_APARTMENT,
  notes: null,
  parentProject: BUILDING_INHERITANCE,
  projectType: { detailFieldSet: PROJECT_DETAIL_FIELD_SETS.COMPANY },
};

describe('ProjectService.getById apartment', () => {
  it('returns the building address and notes, marked as inherited', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(APARTMENT_WITH_BUILDING);

    await expect(service.getById(STORED_APARTMENT.id)).resolves.toMatchObject({
      address: BUILDING_INHERITANCE.address,
      addressPlaceId: TEL_AVIV_PLACE_ID,
      parentNotes: BUILDING_INHERITANCE.notes,
      inheritedFields: ['address', 'addressCity', 'addressPlaceId'],
    });
  });

  it('returns a standalone project unchanged', async () => {
    const { service } = await createService();

    const project = await service.getById(PROJECT_ID);

    expect(project).not.toHaveProperty('inheritedFields');
  });
});

describe('ProjectService.getApartments inheritance', () => {
  it('resolves every listed apartment against its building', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValueOnce({
      ...BUILDING,
      ...BUILDING_INHERITANCE,
    });
    projectRepository.findByFilter.mockResolvedValue({
      items: [STORED_APARTMENT],
      nextCursor: null,
    });

    const page = await service.getApartments(BUILDING_ID, {});

    expect(page.items[0]).toMatchObject({
      parentNotes: BUILDING_INHERITANCE.notes,
    });
  });
});

describe('ProjectService.getApartments waiting reason', () => {
  it('exposes the reason of a waiting apartment and null for the others', async () => {
    const { service, projectRepository, transitionService } =
      await createService();
    const waitingApartment = {
      ...STORED_APARTMENT,
      id: 'apartment-waiting',
      stageId: PROJECT_STATUS_IDS.WAITING_FOR_RESPONSE,
    };
    const activeApartment = {
      ...STORED_APARTMENT,
      id: 'apartment-active',
      stageId: PROJECT_STATUS_IDS.IN_PROGRESS,
    };
    projectRepository.findById.mockResolvedValueOnce({
      ...BUILDING,
      ...BUILDING_INHERITANCE,
    });
    projectRepository.findByFilter.mockResolvedValue({
      items: [waitingApartment, activeApartment],
      nextCursor: null,
    });
    projectRepository.countByFilter.mockResolvedValue(2);
    transitionService.findLatestNotesByTargetStages.mockResolvedValue(
      new Map([[waitingApartment.id, 'ממתינים לבעל הדירה']]),
    );

    const page = await service.getApartments(BUILDING_ID, {});

    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.waitingReason)).toEqual([
      'ממתינים לבעל הדירה',
      null,
    ]);
    expect(
      transitionService.findLatestNotesByTargetStages,
    ).toHaveBeenCalledWith({
      projectIds: [waitingApartment.id],
      toStageIds: WAITING_REASON_SOURCE_STATUS_IDS,
    });
  });
});

describe('ProjectService.update apartment notes', () => {
  it('saves the apartment own notes', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(APARTMENT_WITH_BUILDING);

    await service.update(
      STORED_APARTMENT.id,
      { notes: 'הדייר זמין אחר הצהריים' },
      CREATOR,
    );

    expect(projectRepository.update.mock.calls[0][1]).toMatchObject({
      notes: 'הדייר זמין אחר הצהריים',
    });
  });
});

describe('ProjectService.update building notes', () => {
  it('saves the notes every apartment reads', async () => {
    const { service, projectRepository } = await createService();

    await service.update(PROJECT_ID, { notes: 'תמ״א 38' }, CREATOR);

    expect(projectRepository.update.mock.calls[0][1]).toMatchObject({
      notes: 'תמ״א 38',
    });
  });
});

describe('ProjectService.getApartmentStageCounts', () => {
  it('counts the building apartments per stage', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValueOnce(BUILDING);

    await expect(service.getApartmentStageCounts(BUILDING_ID)).resolves.toEqual(
      { total: 5, byStage: { [QUOTE_STAGE_ID]: 2, [ORDER_STAGE_ID]: 3 } },
    );
    expect(projectRepository.countGroupedByStage).toHaveBeenCalledWith(
      expect.objectContaining({ parentProjectId: BUILDING_ID }),
    );
  });

  it('rejects a project that holds no apartments', async () => {
    const { service } = await createService();

    await expect(service.getApartmentStageCounts(PROJECT_ID)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('ProjectService apartment contact', () => {
  it('creates a linked apartment without persisting duplicated contact text', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValueOnce(BUILDING);
    await service.createApartment(BUILDING_ID, NEW_APARTMENT, CREATOR);

    expect(projectRepository.create.mock.calls[0][0].contactRole).toBeNull();
  });

  it('rejects changes to the retired apartment contact mobile', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);

    await expect(
      service.update(STORED_APARTMENT.id, { contactPhone: null }, CREATOR),
    ).rejects.toThrow('contactPhone');
    expect(projectRepository.update).not.toHaveBeenCalled();
  });
});

describe('ProjectService apartment team changes', () => {
  it('honors an explicit null engineer even when legacy members include an engineer', async () => {
    const { service, projectRepository, projectMemberService } =
      await createService();
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);
    await service.update(
      STORED_APARTMENT.id,
      {
        engineerUserId: null,
        members: [{ userId: 'engineer-1', role: USER_ROLES.ENGINEER }],
      },
      CREATOR,
    );
    expect(projectMemberService.setApartmentEngineer).toHaveBeenCalledWith(
      STORED_APARTMENT.id,
      null,
      TRANSACTION,
    );
  });

  it('assigns an apartment engineer without overriding inherited non-engineering roles', async () => {
    const { service, projectRepository, projectMemberService } =
      await createService();
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);
    await service.update(
      STORED_APARTMENT.id,
      { engineerUserId: 'engineer-1' },
      CREATOR,
    );
    expect(projectRepository.update.mock.calls[0][1]).not.toHaveProperty(
      'hasOwnTeam',
    );
    expect(projectMemberService.replaceApartmentTeam).not.toHaveBeenCalled();
    expect(projectMemberService.setApartmentEngineer).toHaveBeenCalledWith(
      STORED_APARTMENT.id,
      'engineer-1',
      TRANSACTION,
    );
  });

  it('clears only the apartment engineer when requested', async () => {
    const { service, projectRepository, projectMemberService } =
      await createService();
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);
    await service.update(
      STORED_APARTMENT.id,
      { engineerUserId: null },
      CREATOR,
    );
    expect(projectMemberService.replaceApartmentTeam).not.toHaveBeenCalled();
    expect(projectMemberService.setApartmentEngineer).toHaveBeenCalledWith(
      STORED_APARTMENT.id,
      null,
      TRANSACTION,
    );
  });

  it('starts an own team when members are assigned', async () => {
    const { service, projectRepository, projectMemberService } =
      await createService();
    const members = [{ userId: 'secretary-1', role: USER_ROLES.SECRETARY }];
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);
    await service.update(STORED_APARTMENT.id, { members }, CREATOR);
    expect(projectRepository.update.mock.calls[0][1]).toMatchObject({
      hasOwnTeam: true,
    });
    expect(projectMemberService.replaceApartmentTeam).toHaveBeenCalledWith(
      STORED_APARTMENT.id,
      members,
      TRANSACTION,
    );
    expect(projectMemberService.setApartmentEngineer).not.toHaveBeenCalled();
  });

  it('keeps an explicitly empty own team distinct from inheritance', async () => {
    const { service, projectRepository, projectMemberService } =
      await createService();
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);
    await service.update(
      STORED_APARTMENT.id,
      { hasOwnTeam: true, members: [] },
      CREATOR,
    );
    expect(projectRepository.update.mock.calls[0][1]).toMatchObject({
      hasOwnTeam: true,
    });
    expect(projectMemberService.replaceApartmentTeam).toHaveBeenCalledWith(
      STORED_APARTMENT.id,
      [],
      TRANSACTION,
    );
  });

  it('clears stored members when returning to the building team', async () => {
    const { service, projectRepository, projectMemberService } =
      await createService();
    projectRepository.findById.mockResolvedValue({
      ...STORED_APARTMENT,
      hasOwnTeam: true,
    });
    await service.update(STORED_APARTMENT.id, { hasOwnTeam: false }, CREATOR);
    expect(projectRepository.update.mock.calls[0][1]).toMatchObject({
      hasOwnTeam: false,
    });
    expect(projectMemberService.replaceApartmentTeam).toHaveBeenCalledWith(
      STORED_APARTMENT.id,
      [],
      TRANSACTION,
    );
    expect(projectMemberService.setApartmentEngineer).not.toHaveBeenCalled();
  });

  it('rejects conflicting inherited-team and own-member changes atomically', async () => {
    const { service, projectRepository, projectMemberService } =
      await createService();
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);
    await expect(
      service.update(
        STORED_APARTMENT.id,
        {
          hasOwnTeam: false,
          members: [{ userId: 'secretary-1', role: USER_ROLES.SECRETARY }],
        },
        CREATOR,
      ),
    ).rejects.toThrow('cannot also provide its own non-engineering members');
    expect(projectRepository.update).not.toHaveBeenCalled();
    expect(projectMemberService.replaceApartmentTeam).not.toHaveBeenCalled();
  });

  it('does not replace the team when only apartment notes change', async () => {
    const { service, projectRepository, projectMemberService } =
      await createService();
    projectRepository.findById.mockResolvedValue(STORED_APARTMENT);
    await service.update(STORED_APARTMENT.id, { notes: 'הערה לדירה' }, CREATOR);
    expect(projectRepository.update.mock.calls[0][1]).not.toHaveProperty(
      'hasOwnTeam',
    );
    expect(projectMemberService.replaceApartmentTeam).not.toHaveBeenCalled();
  });

  it('rejects inheritance changes on a standalone project', async () => {
    const { service, projectRepository, projectMemberService } =
      await createService();
    await expect(
      service.update(PROJECT_ID, { hasOwnTeam: false }, CREATOR),
    ).rejects.toThrow('only be changed for apartments');
    expect(projectRepository.update).not.toHaveBeenCalled();
    expect(projectMemberService.replaceForProject).not.toHaveBeenCalled();
  });

  it('rejects assigning an engineer directly to a residential building', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(BUILDING);
    await expect(
      service.update(
        BUILDING_ID,
        { members: [{ userId: 'engineer-1', role: USER_ROLES.ENGINEER }] },
        CREATOR,
      ),
    ).rejects.toThrow('Assign engineering workers to apartments');
    expect(projectRepository.update).not.toHaveBeenCalled();
  });

  it.each(['א24', '24/1', '24אב'])(
    'rejects malformed updated apartment number %s',
    async (customerApartment) => {
      const { service, projectRepository } = await createService();
      projectRepository.findById.mockResolvedValue(STORED_APARTMENT);
      await expect(
        service.update(STORED_APARTMENT.id, { customerApartment }, CREATOR),
      ).rejects.toThrow('Apartment number must be digits');
      expect(projectRepository.update).not.toHaveBeenCalled();
    },
  );
});

describe('ProjectService feature-specific update permissions', () => {
  it('delegates ordinary edits with the original actor and payload', async () => {
    const { service } = await createService();
    const project = await service.getById(PROJECT_ID);
    const update = jest.spyOn(service, 'update').mockResolvedValue(project);
    const actor = authorizedUser([PERMISSIONS.PROJECTS_UPDATE]);
    const changes = { name: 'Feature-permitted project edit' };

    await expect(
      service.updateForActor(PROJECT_ID, changes, actor),
    ).resolves.toBe(project);
    expect(update).toHaveBeenCalledWith(PROJECT_ID, changes, actor);
  });

  it('rejects status hidden inside a generic update without a status-change grant', async () => {
    const { service } = await createService();
    const project = await service.getById(PROJECT_ID);
    const update = jest.spyOn(service, 'update').mockResolvedValue(project);
    const actor = authorizedUser([PERMISSIONS.PROJECTS_UPDATE]);

    expect(() =>
      service.updateForActor(PROJECT_ID, { stageId: ORDER_STAGE_ID }, actor),
    ).toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('delegates a status update only with both update and status-change grants', async () => {
    const { service } = await createService();
    const project = await service.getById(PROJECT_ID);
    const update = jest.spyOn(service, 'update').mockResolvedValue(project);
    const actor = authorizedUser([
      PERMISSIONS.PROJECTS_UPDATE,
      PERMISSIONS.PROJECTS_STATUS_CHANGE,
    ]);
    const changes = { stageId: ORDER_STAGE_ID };

    await expect(
      service.updateForActor(PROJECT_ID, changes, actor),
    ).resolves.toBe(project);
    expect(update).toHaveBeenCalledWith(PROJECT_ID, changes, actor);
  });

  it('requires the generic update grant even when status-change permission exists', async () => {
    const { service } = await createService();
    const project = await service.getById(PROJECT_ID);
    const update = jest.spyOn(service, 'update').mockResolvedValue(project);
    const actor = authorizedUser([PERMISSIONS.PROJECTS_STATUS_CHANGE]);

    expect(() =>
      service.updateForActor(PROJECT_ID, { stageId: ORDER_STAGE_ID }, actor),
    ).toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('does not infer update rights from an administrator account role', async () => {
    const { service } = await createService();
    const project = await service.getById(PROJECT_ID);
    const update = jest.spyOn(service, 'update').mockResolvedValue(project);

    expect(() =>
      service.updateForActor(PROJECT_ID, { name: 'Denied' }, authorizedUser()),
    ).toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('ProjectService apartment commercial fields', () => {
  it('persists supplied ownership and exact credit on apartment creation', async () => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValueOnce(BUILDING);
    await service.createApartment(
      BUILDING_ID,
      {
        ...NEW_APARTMENT,
        apartmentOwnership: APARTMENT_OWNERSHIP.BUYER,
        apartmentCredit: '120.50',
      },
      CREATOR,
    );
    expect(projectRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        apartmentOwnership: APARTMENT_OWNERSHIP.BUYER,
        apartmentCredit: '120.50',
      }),
      TRANSACTION,
    );
  });
  it.each([
    { apartmentCredit: '0', apartmentOwnership: APARTMENT_OWNERSHIP.LANDOWNER },
    { apartmentCredit: null, apartmentOwnership: null },
  ])(
    'updates or explicitly clears apartment commercial values',
    async (changes) => {
      const { service, projectRepository } = await createService();
      projectRepository.findById.mockResolvedValue(STORED_APARTMENT);
      await service.update(STORED_APARTMENT.id, changes, CREATOR);
      expect(projectRepository.update).toHaveBeenCalledWith(
        STORED_APARTMENT.id,
        expect.objectContaining(changes),
        TRANSACTION,
      );
    },
  );
  it.each([
    { apartmentCredit: '1' },
    { apartmentOwnership: APARTMENT_OWNERSHIP.BUYER },
  ])('rejects apartment-only fields on a root project', async (changes) => {
    const { service, projectRepository } = await createService();
    projectRepository.findById.mockResolvedValue(BUILDING);
    await expect(
      service.update(BUILDING_ID, changes, CREATOR),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(projectRepository.update).not.toHaveBeenCalled();
  });
});

describe('ProjectService lighting persistence', () => {
  const projectInput = {
    ...COMPANY_DETAILS,
    ...COMPANY_INTAKE,
    customerId: CUSTOMER_ID,
    name: 'פרויקט הנמכה לתאורה',
    projectTypeId: COMPANY_TYPE_ID,
    members: [],
  };
  const enabledProject = {
    ...STORED_INTAKE_PROJECT,
    hasGeneralLightingCeilingLowering: true,
    generalLightingCeilingLoweringHeight: 25.5,
  };

  it.each([0, 25.125])(
    'passes enabled centimeter height %s into the actual project creation transaction',
    async (height) => {
      const state = await createService();
      await state.service.create(
        {
          ...projectInput,
          hasGeneralLightingCeilingLowering: true,
          generalLightingCeilingLoweringHeight: height,
        },
        CREATOR,
      );
      const [attributes, transaction] =
        state.projectRepository.create.mock.calls[0];
      expect(attributes.hasGeneralLightingCeilingLowering).toBe(true);
      expect(attributes.generalLightingCeilingLoweringHeight).toBe(height);
      expect(transaction).toBe(TRANSACTION);
    },
  );

  it('persists disabled/no-height defaults when creation omits lighting', async () => {
    const state = await createService();
    await state.service.create(projectInput, CREATOR);
    const [attributes] = state.projectRepository.create.mock.calls[0];
    expect(attributes.hasGeneralLightingCeilingLowering).toBe(false);
    expect(attributes.generalLightingCeilingLoweringHeight).toBeNull();
  });

  it('rejects creation with enabled lighting but no height before all writes and notifications', async () => {
    const state = await createService();
    await expect(
      state.service.create(
        { ...projectInput, hasGeneralLightingCeilingLowering: true },
        CREATOR,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(state.projectRepository.create).not.toHaveBeenCalled();
    expect(state.projectMemberService.replaceForProject).not.toHaveBeenCalled();
    expect(state.taskInitialization.ensureForProject).not.toHaveBeenCalled();
    expect(state.eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('preserves a stored height when updating the enabled toggle without a height', async () => {
    const state = await createService();
    state.projectRepository.findById.mockResolvedValue(enabledProject);
    await state.service.update(
      PROJECT_ID,
      { hasGeneralLightingCeilingLowering: true },
      CREATOR,
    );
    const [id, attributes, transaction] =
      state.projectRepository.update.mock.calls[0];
    expect(id).toBe(PROJECT_ID);
    expect(transaction).toBe(TRANSACTION);
    expect(attributes.hasGeneralLightingCeilingLowering).toBe(true);
    expect(attributes.generalLightingCeilingLoweringHeight).toBe(25.5);
  });

  it('clears the stored height when an update disables lighting', async () => {
    const state = await createService();
    state.projectRepository.findById.mockResolvedValue(enabledProject);
    await state.service.update(
      PROJECT_ID,
      { hasGeneralLightingCeilingLowering: false },
      CREATOR,
    );
    const [, attributes] = state.projectRepository.update.mock.calls[0];
    expect(attributes.hasGeneralLightingCeilingLowering).toBe(false);
    expect(attributes.generalLightingCeilingLoweringHeight).toBeNull();
  });

  it('merges a height-only update with the stored enabled state', async () => {
    const state = await createService();
    state.projectRepository.findById.mockResolvedValue(enabledProject);
    await state.service.update(
      PROJECT_ID,
      { generalLightingCeilingLoweringHeight: 0 },
      CREATOR,
    );
    const [, attributes] = state.projectRepository.update.mock.calls[0];
    expect(attributes.hasGeneralLightingCeilingLowering).toBe(true);
    expect(attributes.generalLightingCeilingLoweringHeight).toBe(0);
  });

  it('does not rewrite either lighting field in an unrelated rename', async () => {
    const state = await createService();
    state.projectRepository.findById.mockResolvedValue(enabledProject);
    await state.service.update(PROJECT_ID, { name: 'שם מעודכן' }, CREATOR);
    const [, attributes] = state.projectRepository.update.mock.calls[0];
    expect(attributes.name).toBe('שם מעודכן');
    expect('hasGeneralLightingCeilingLowering' in attributes).toBe(false);
    expect('generalLightingCeilingLoweringHeight' in attributes).toBe(false);
  });

  it('rejects enabling a previously disabled record without a height before writing', async () => {
    const state = await createService();
    state.projectRepository.findById.mockResolvedValue({
      ...STORED_INTAKE_PROJECT,
      hasGeneralLightingCeilingLowering: false,
      generalLightingCeilingLoweringHeight: null,
    });
    await expect(
      state.service.update(
        PROJECT_ID,
        { hasGeneralLightingCeilingLowering: true },
        CREATOR,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(state.projectRepository.update).not.toHaveBeenCalled();
    expect(state.projectMemberService.replaceForProject).not.toHaveBeenCalled();
    expect(state.transitionService.record).not.toHaveBeenCalled();
  });

  it('rejects explicitly clearing an enabled record height before writing', async () => {
    const state = await createService();
    state.projectRepository.findById.mockResolvedValue(enabledProject);
    await expect(
      state.service.update(
        PROJECT_ID,
        { generalLightingCeilingLoweringHeight: null },
        CREATOR,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(state.projectRepository.update).not.toHaveBeenCalled();
  });
});
