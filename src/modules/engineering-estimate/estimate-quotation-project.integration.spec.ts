import type {
  IEstimateRecord,
  IEstimateReviewSnapshot,
} from './interfaces/engineering-estimate.interface';

import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import { ProjectService } from '@Modules/project/project.service';
import { EstimateApprovalService } from './estimate-approval.service';
import { EngineeringEstimateService } from './engineering-estimate.service';
import { EngineeringEstimateRepository } from './engineering-estimate.repository';
import { TaskQuotationFixture } from '@Modules/quotation/testing/task-quotation.fixture';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const fixture = new TaskQuotationFixture();
const { actor, projectId, customerId } = fixture;
const id = randomUUID();
const version = 1;
const conversion = (savedProjectId: string | null) => {
  const estimates = mock<EngineeringEstimateService>();
  const repository = mock<EngineeringEstimateRepository>();
  const projects = mock<ProjectService>();
  estimates.lockVersion.mockResolvedValue(
    mock<IEstimateRecord>({ id, version }),
  );
  repository.revision.mockResolvedValue({
    version,
    status: 'approved',
    quotationId: null,
    quotationUnavailable: false,
    snapshot: mock<IEstimateReviewSnapshot>({
      projectId: savedProjectId,
      customerId,
      lines: [],
    }),
  });
  projects.quotationContext.mockResolvedValue({ id: projectId, customerId });
  const service = new EstimateApprovalService(
    repository,
    estimates,
    new DatabaseTransactionService(fixture.database()),
    mock(),
    mock(),
    projects,
    mock(),
    fixture.service(),
  );
  return { repository, service };
};
beforeAll(() => fixture.start(), 30000);
beforeEach(() => fixture.reset());
afterAll(() => fixture.close());

it('rejects an approved snapshot without a project even when the caller supplies a customer', async () => {
  const { repository, service } = conversion(null);
  await expect(
    service.createQuotation({ actor, id }, { version, customerId }),
  ).rejects.toMatchObject({ status: 400 });
  expect(repository.linkQuotation).not.toHaveBeenCalled();
  expect(
    (await fixture.database().query('SELECT id FROM quotations'))[0],
  ).toEqual([]);
});
it('creates the linked draft for the project customer recorded on the approved snapshot', async () => {
  const { repository, service } = conversion(projectId);
  const { quotationId } = await service.createQuotation(
    { actor, id },
    { version, customerId: randomUUID() },
  );
  expect(await fixture.service().getById(quotationId)).toMatchObject({
    customerId,
    projectId,
    status: 'draft',
  });
  expect(repository.linkQuotation).toHaveBeenCalledWith(
    id,
    version,
    quotationId,
    expect.anything(),
  );
});
it('rolls the draft and its primary link back if linking the approved estimate revision fails', async () => {
  const { repository, service } = conversion(projectId);
  repository.linkQuotation.mockRejectedValue(new Error('Revision link failed'));
  await expect(
    service.createQuotation({ actor, id }, { version }),
  ).rejects.toThrow('Revision link failed');
  expect(
    (await fixture.database().query('SELECT id FROM quotations'))[0],
  ).toEqual([]);
  expect(
    (
      await fixture
        .database()
        .query('SELECT quotation_id FROM quotation_projects')
    )[0],
  ).toEqual([]);
});
