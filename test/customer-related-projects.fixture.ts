import {
  TProjectTaskEnvironment,
  createProjectTaskEnvironment,
} from './project-task-initialization.fixture';

import { randomUUID } from 'node:crypto';
import { User } from '@Modules/user/entities/user.entity';
import { USER_ROLES } from '@Constants/user-role.constant';
import { Project } from '@Modules/project/entities/project.entity';
import { CustomerService } from '@Modules/customer/customer.service';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';
import { CustomerRepository } from '@Modules/customer/customer.repository';
import { ProjectType } from '@Modules/project-type/entities/project-type.entity';
import { CustomerProjectService } from '@Modules/project/customer-project.service';
import { CustomerProjectRepository } from '@Modules/project/customer-project.repository';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';
import { CustomerContactService } from '@Modules/customer-contact/customer-contact.service';
import { CustomerContactRepository } from '@Modules/customer-contact/customer-contact.repository';

interface IRelatedProjectSeed {
  id?: string;
  name?: string;
  stageId?: string;
  updatedAt?: string;
  hasOwnTeam?: boolean;
  projectTypeId?: string;
  parentProjectId?: string;
  customerId: string | null;
}

const createCustomerProjectFixtures = async (base: TProjectTaskEnvironment) => {
  const contacts = new CustomerContactService(
    new CustomerContactRepository(),
    base.transactions,
  );
  const customers = new CustomerService(
    new CustomerRepository(base.sequelize),
    contacts,
    base.transactions,
  );
  const projects = new CustomerProjectService(
    customers,
    new CustomerProjectRepository(),
  );
  const [standalone, building] = await Promise.all([
    ProjectType.findOne({ where: { canHaveApartments: false } }),
    ProjectType.findOne({ where: { canHaveApartments: true } }),
  ]);
  if (!standalone || !building) {
    throw new Error('The isolated project types are missing.');
  }

  const manager = await User.create({
    role: USER_ROLES.PROJECT_MANAGER,
    firstName: 'מנהל',
    lastName: 'זמני',
    phone: '03-1234569',
    passwordHash: 'disposable-hash',
    email: 'related-project-manager@example.invalid',
  });

  const sequence = { customer: 0, project: 0 };
  const customer = (name = 'לקוח משותף') => {
    sequence.customer += 1;

    return Customer.create({
      name,
      taxId: String(700000000 + sequence.customer),
      phone: '03-1234567',
      email: 'related-projects@example.invalid',
      address: 'רחוב בדיקה 1',
      contactName: 'איש קשר בדיקה',
      customerType: PROJECT_DETAIL_FIELD_SETS.COMPANY,
      createdById: base.creator.id,
    });
  };
  const project = (input: IRelatedProjectSeed) => {
    sequence.project += 1;

    const attributes = {
      ...input,
      id: input.id ?? randomUUID(),
      code: `RP${String(sequence.project).padStart(6, '0')}`,
      name: input.name ?? `פרויקט בדיקה ${sequence.project}`,
      updatedAt: new Date(input.updatedAt ?? '2026-10-30T12:00:00.000Z'),
      projectTypeId: input.projectTypeId ?? standalone.id,
      stageId: input.stageId ?? PROJECT_STATUS_IDS.DRAFT,
      createdById: base.creator.id,
    };

    return Project.create(attributes, { silent: true });
  };

  return {
    customer,
    project,
    projects,
    manager,
    close: base.close,
    creator: base.creator,
    engineer: base.engineer,
    sequelize: base.sequelize,
    buildingTypeId: building.id,
  };
};

export const createCustomerProjectEnvironment = async () => {
  const base = await createProjectTaskEnvironment();
  try {
    return await createCustomerProjectFixtures(base);
  } catch (error) {
    await base.close();

    throw error;
  }
};

export type TCustomerProjectEnvironment = Awaited<
  ReturnType<typeof createCustomerProjectEnvironment>
>;
