import {
  CUSTOMER_PROJECT_TEST_IDS,
  makeCustomerProjectParent,
} from '../../testing/customer-project.fixture';

import { Sequelize } from 'sequelize-typescript';
import { Project } from './entities/project.entity';
import { User } from '@Modules/user/entities/user.entity';
import { InternalServerErrorException } from '@nestjs/common';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { CustomerProjectRepository } from './customer-project.repository';
import { ProjectType } from '@Modules/project-type/entities/project-type.entity';
import { ProjectStage } from '@Modules/project-stage/entities/project-stage.entity';
import { ProjectMember } from '@Modules/project-member/entities/project-member.entity';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';

describe('related project computed-count boundary', () => {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    logging: false,
    models: [
      User,
      Customer,
      CustomerContact,
      ProjectType,
      ProjectStage,
      Project,
      ProjectMember,
    ],
  });
  const repository = new CustomerProjectRepository();
  const scope = {
    customerId: CUSTOMER_PROJECT_TEST_IDS.CUSTOMER,
    search: '',
    stageId: null,
  };
  const batch = { size: 8, cursor: null };

  const rowWithCount = (count: unknown) => {
    const data = makeCustomerProjectParent();
    const row = Project.build(data);
    jest
      .spyOn(row, 'get')
      .mockImplementation((key: unknown) =>
        key === 'apartmentCount' ? count : data,
      );
    jest.spyOn(Project, 'findAll').mockResolvedValue([row]);

    return data;
  };

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await sequelize.close();
  });

  it.each([0, 64])(
    'preserves an actual numeric computed count %s alongside the selected project data',
    async (count) => {
      const data = rowWithCount(count);
      expect(await repository.findPage(scope, batch)).toEqual([
        { ...data, apartmentCount: count },
      ]);
    },
  );

  it.each([null, '64', true, {}, []])(
    'rejects a malformed computed count with a controlled server error: %p',
    async (count) => {
      rowWithCount(count);
      await expect(repository.findPage(scope, batch)).rejects.toEqual(
        new InternalServerErrorException('Invalid related project count'),
      );
    },
  );
});
