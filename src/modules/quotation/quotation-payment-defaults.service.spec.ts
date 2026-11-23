import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import { Sequelize, Transaction } from 'sequelize';
import { QuotationService } from './quotation.service';
import type { UserService } from '@Modules/user/user.service';
import type { SaveQuotationDto } from './dto/save-quotation.dto';
import type { QuotationRepository } from './quotation.repository';
import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';
import type { ProjectService } from '@Modules/project/project.service';
import type { CustomerService } from '@Modules/customer/customer.service';
import { quotationDocumentFixture } from '../../testing/quotation.fixture';
import type { UserRoleService } from '@Modules/user-role/user-role.service';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import type { QuotationSelectionService } from './quotation-selection.service';
import type { ICustomer } from '@Modules/customer/interfaces/customer.interface';
import type { IPaymentConfiguration } from '@Interfaces/payment-configuration.interface';
import type { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import type { QuotationItemService } from '@Modules/quotation-item/quotation-item.service';
import type { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import { TaskQuotationLinksService } from '@Modules/quotation/task-quotation-links.service';
import type { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import type { QuotationSectionService } from '@Modules/quotation-section/quotation-section.service';
import type { QuotationProjectService } from '@Modules/quotation-project/quotation-project.service';

const customConfiguration = (): IPaymentConfiguration => ({
  paymentTerms: null,
  paymentSchedule: [
    { percent: '30', text: 'בחתימה' },
    { percent: '70', text: 'במסירה' },
  ],
});

const setup = (configuration: IPaymentConfiguration) => {
  const repository = mock<QuotationRepository>();
  const rules = mock<QuotationRuleService>();
  const sections = mock<QuotationSectionService>();
  const items = mock<QuotationItemService>();
  const catalogue = mock<CatalogueItemService>();
  const selection = mock<QuotationSelectionService>();
  const customers = mock<CustomerService>();
  const projects = mock<ProjectService>();
  const links = mock<QuotationProjectService>();
  const transactions = mock<DatabaseTransactionService>();
  const users = mock<UserService>();
  const userRoles = mock<UserRoleService>();
  const transaction = new Transaction(
    new Sequelize({ dialect: 'postgres', logging: false }),
    {},
  );
  const current = quotationDocumentFixture([]);
  const customer = Object.assign(mock<ICustomer>(), {
    id: randomUUID(),
    ...configuration,
  });
  const actor = mock<IAuthorizedUser>({
    id: randomUUID(),
    firstName: 'דנה',
    lastName: 'כהן',
  });
  const service = new QuotationService(
    repository,
    rules,
    sections,
    items,
    catalogue,
    selection,
    customers,
    projects,
    links,
    transactions,
    users,
    userRoles,
    mock<TaskQuotationLinksService>(),
  );
  jest.spyOn(service, 'getById').mockResolvedValue(mock({ id: randomUUID() }));
  jest.spyOn(service, 'document').mockResolvedValue(current);
  transactions.run.mockImplementation((work) => work(transaction));
  customers.getById.mockResolvedValue(customer);
  repository.nextNumber.mockResolvedValue('2611-000001');
  rules.configuration.mockResolvedValue({
    rules: current.ruleConfiguration,
    fingerprint: current.ruleConfigFingerprint,
  });
  links.countApartmentLinks.mockResolvedValue(0);
  selection.snapshots.mockResolvedValue([]);
  return { service, repository, transaction, customer, actor, current };
};

describe('quotation customer payment snapshots', () => {
  it.each(
    Object.values(PAYMENT_TERMS).filter((term) => term !== PAYMENT_TERMS.OTHER),
  )(
    'copies configured preset %s on initial quotation creation',
    async (paymentTerms) => {
      const { service, repository, customer, actor } = setup({
        paymentTerms,
        paymentSchedule: [],
      });
      await service.create({ customerId: customer.id }, actor);
      expect(jest.spyOn(repository, 'create')).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentTerms,
          paymentSchedule: [],
          paymentTermsNote: '',
        }),
        expect.anything(),
      );
    },
  );

  it('keeps custom stages independent across customer and sibling quotation snapshots', async () => {
    const configuration = customConfiguration();
    const { service, repository, customer, actor } = setup(configuration);
    await service.create({ customerId: customer.id }, actor);
    await service.create({ customerId: customer.id }, actor);
    const first = repository.create.mock.calls[0][0];
    const second = repository.create.mock.calls[1][0];
    expect(first.paymentSchedule).toEqual(configuration.paymentSchedule);
    expect(first.paymentSchedule).not.toBe(configuration.paymentSchedule);
    expect(first.paymentSchedule[0]).not.toBe(configuration.paymentSchedule[0]);
    first.paymentSchedule[0].text = 'שינוי בהצעה הראשונה';
    expect(second.paymentSchedule[0].text).toBe('בחתימה');
    expect(configuration.paymentSchedule[0].text).toBe('בחתימה');
    configuration.paymentSchedule[1].text = 'ברירת מחדל חדשה ללקוח';
    expect(second.paymentSchedule[1].text).toBe('במסירה');
  });

  it.each([null, PAYMENT_TERMS.OTHER])(
    'keeps the normal fallback for an unconfigured %s default',
    async (paymentTerms) => {
      const { service, repository, customer, actor } = setup({
        paymentTerms,
        paymentSchedule: [],
      });
      await service.create({ customerId: customer.id }, actor);
      expect(jest.spyOn(repository, 'create')).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentTerms: null,
          paymentSchedule: [],
          paymentTermsNote: '',
        }),
        expect.anything(),
      );
    },
  );

  it('preserves manually edited draft payments and note when changing customer', async () => {
    const { service, repository, customer, actor, current, transaction } =
      setup({
        paymentTerms: PAYMENT_TERMS.PREPAID,
        paymentSchedule: [],
      });
    const input: SaveQuotationDto = {
      customerId: customer.id,
      projectId: null,
      version: current.version,
      date: current.date,
      brand: '',
      brands: [],
      paymentTerms: null,
      paymentTermsNote: 'הערה מקומית להצעה',
      paymentSchedule: [{ percent: '42', text: 'שלב בטיוטה' }],
      discountPercent: '0',
      targetPretaxAmount: null,
      internalNotes: '',
      sections: [],
    };
    await service.save(current.id, input, actor);
    expect(jest.spyOn(repository, 'update')).toHaveBeenCalledWith(
      current.id,
      expect.objectContaining({
        customerId: customer.id,
        paymentTerms: null,
        paymentTermsNote: input.paymentTermsNote,
        paymentSchedule: input.paymentSchedule,
      }),
      transaction,
    );
    expect(customer.paymentTerms).toBe(PAYMENT_TERMS.PREPAID);
    expect(customer.paymentSchedule).toEqual([]);
  });
});
