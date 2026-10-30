import { USER_ROLES } from '@Constants/user-role.constant';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';
import { IProject } from '@Modules/project/interfaces/project.interface';
import { IProjectType } from '@Modules/project-type/interfaces/project-type.interface';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';
import { ICustomerProjectSource } from '@Modules/project/interfaces/customer-project.interface';

export const CUSTOMER_PROJECT_TEST_IDS = {
  CUSTOMER: '10000000-0000-4000-8000-000000000001',
  PROJECT: '10000000-0000-4000-8000-000000000002',
  OTHER: '10000000-0000-4000-8000-000000000003',
  MEMBER: '10000000-0000-4000-8000-000000000004',
  TYPE: '10000000-0000-4000-8000-000000000005',
} as const;

export const makeCustomerProjectUser = (): IUser => ({
  id: CUSTOMER_PROJECT_TEST_IDS.MEMBER,
  email: 'private@example.invalid',
  phone: '0500000000',
  role: USER_ROLES.ENGINEER,
  firstName: 'אורי',
  lastName: 'כהן',
  employeeNumber: 'ENG-1',
  passwordHash: 'must-not-be-returned',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  updatedAt: new Date('2026-10-01T10:00:00.000Z'),
  deletedAt: null,
});

export const makeCustomerProjectType = (
  changes: Partial<IProjectType> = {},
): IProjectType => ({
  id: CUSTOMER_PROJECT_TEST_IDS.TYPE,
  name: 'מסחרי',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  updatedAt: new Date('2026-10-01T10:00:00.000Z'),
  position: 1,
  tag: null,
  icon: null,
  subtitle: null,
  description: null,
  canHaveApartments: false,
  detailFieldSet: PROJECT_DETAIL_FIELD_SETS.COMPANY,
  ...changes,
});

export const makeCustomerProjectSource = (
  changes: Partial<ICustomerProjectSource> = {},
): ICustomerProjectSource => ({
  id: CUSTOMER_PROJECT_TEST_IDS.PROJECT,
  name: 'פרויקט לדוגמה',
  code: 'GA-1',
  stageId: PROJECT_STATUS_IDS.WAITING,
  updatedAt: new Date('2026-10-20T10:00:00.000Z'),
  parentProjectId: null,
  customerFloor: null,
  hasOwnTeam: false,
  members: [],
  projectType: makeCustomerProjectType(),
  apartmentCount: 0,
  ...changes,
});

export const makeCustomerProjectParent = (
  changes: Partial<IProject> = {},
): IProject => ({
  id: CUSTOMER_PROJECT_TEST_IDS.OTHER,
  name: 'בניין אחר',
  code: 'BLDG-1',
  stageId: PROJECT_STATUS_IDS.WAITING,
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  updatedAt: new Date('2026-10-20T10:00:00.000Z'),
  createdById: CUSTOMER_PROJECT_TEST_IDS.MEMBER,
  projectTypeId: CUSTOMER_PROJECT_TEST_IDS.TYPE,
  customerId: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
  parentProjectId: null,
  notes: 'private parent notes',
  customerName: null,
  customerCity: null,
  customerUnit: null,
  customerFloor: null,
  customerPhone: null,
  customerEmail: null,
  customerAddress: null,
  customerApartment: null,
  customerCompanyNumber: null,
  customerAssociationNumber: null,
  address: null,
  addressCity: null,
  addressPlaceId: null,
  contactName: null,
  contactRole: null,
  contactPhone: null,
  paymentTerms: null,
  paymentTermsNote: null,
  driveFolderId: null,
  priorityId: null,
  prioritySyncedAt: null,
  apartmentOwnership: null,
  apartmentCredit: null,
  deletedAt: null,
  ...changes,
});
