import { ProjectContactService } from './project-contact.service';
import { Project } from '@Modules/project/entities/project.entity';
import { ProjectContactLink } from './entities/project-contact-link.entity';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';

describe('ProjectContactService.link', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the linked contact required by the client response guard', async () => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const transactions = {
      run: jest.fn((work: (value: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as DatabaseTransactionService;
    const contact = {
      id: CONTACT_ID,
      name: 'איש קשר',
      phone: null,
      email: null,
    };
    const hydrated = {
      projectId: PROJECT_ID,
      contactId: CONTACT_ID,
      role: null,
      isPrimary: true,
      contact,
    } as ProjectContactLink;
    jest
      .spyOn(Project, 'findByPk')
      .mockResolvedValue({ id: PROJECT_ID } as Project);
    jest
      .spyOn(CustomerContact, 'findByPk')
      .mockResolvedValue(contact as CustomerContact);
    jest.spyOn(ProjectContactLink, 'update').mockResolvedValue([0]);
    const findLink = jest
      .spyOn(ProjectContactLink, 'findOne')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(hydrated);
    const createLink = jest
      .spyOn(ProjectContactLink, 'create')
      .mockResolvedValue(hydrated);

    const service = new ProjectContactService(transactions);
    await expect(
      service.link(PROJECT_ID, {
        contactId: CONTACT_ID,
        role: null,
        isPrimary: true,
      }),
    ).resolves.toBe(hydrated);
    expect(createLink).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, contactId: CONTACT_ID }),
      { transaction },
    );
    expect(findLink).toHaveBeenLastCalledWith({
      where: { projectId: PROJECT_ID, contactId: CONTACT_ID },
      include: [CustomerContact],
      transaction,
    });
  });
});
