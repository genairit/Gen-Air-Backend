import { Customer } from './entities/customer.entity';
import { Project } from '@Modules/project/entities/project.entity';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { CustomerProjectLinkService } from './customer-project-link.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';

describe('CustomerProjectLinkService', () => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const transactions = {
    run: jest.fn((work: (transaction: unknown) => Promise<unknown>) =>
      work(transaction),
    ),
  };
  const service = new CustomerProjectLinkService(
    transactions as DatabaseTransactionService,
  );

  afterEach(() => jest.restoreAllMocks());

  it('changes only selected projects and never cascades into apartments', async () => {
    const project = {
      customerId: null,
      update: jest.fn().mockResolvedValue(null),
    };
    const findCustomer = jest
      .spyOn(Customer, 'findByPk')
      .mockResolvedValue({ id: CUSTOMER_ID } as Customer);
    const findProject = jest
      .spyOn(Project, 'findByPk')
      .mockResolvedValue(project as Project);

    await service.link(CUSTOMER_ID, {
      projects: [{ projectId: PROJECT_ID, expectedCustomerId: null }],
    });

    expect(findCustomer).toHaveBeenCalledTimes(1);
    expect(findProject).toHaveBeenCalledTimes(1);
    expect(findProject).toHaveBeenCalledWith(PROJECT_ID, expect.any(Object));
    expect(project.update).toHaveBeenCalledWith(
      { customerId: CUSTOMER_ID },
      { transaction },
    );
  });

  it('rejects a concurrent reassignment before writing', async () => {
    const project = { customerId: OTHER_ID, update: jest.fn() };
    jest
      .spyOn(Customer, 'findByPk')
      .mockResolvedValue({ id: CUSTOMER_ID } as Customer);
    jest.spyOn(Project, 'findByPk').mockResolvedValue(project as Project);

    await expect(
      service.link(CUSTOMER_ID, {
        projects: [{ projectId: PROJECT_ID, expectedCustomerId: null }],
      }),
    ).rejects.toThrow(ConflictException);
    expect(project.update).not.toHaveBeenCalled();
  });

  it('rejects duplicate projects before opening a transaction', async () => {
    await expect(
      service.link(CUSTOMER_ID, {
        projects: [
          { projectId: PROJECT_ID, expectedCustomerId: null },
          { projectId: PROJECT_ID, expectedCustomerId: null },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
