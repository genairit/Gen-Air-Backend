import { Quotation } from './entities/quotation.entity';
import { QuotationRepository } from './quotation.repository';

describe('QuotationRepository status counts', () => {
  test('rejects explicitly when the quotation database is unavailable', async () => {
    expect(Quotation.sequelize).toBeFalsy();
    const repository = new QuotationRepository();
    await expect(repository.statusCounts('')).rejects.toThrow(
      'Quotation database unavailable',
    );
  });
});
