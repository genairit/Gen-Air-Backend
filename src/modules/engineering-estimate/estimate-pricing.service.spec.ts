import {
  estimateSubtotal,
  EstimatePricingService,
} from './estimate-pricing.service';

import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Sequelize, Transaction } from 'sequelize';
import { ESTIMATE_SCOPE } from './constants/engineering-estimate.constant';
import type { IEstimateArea } from './interfaces/engineering-estimate.interface';
import { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';

describe(EstimatePricingService.name, () => {
  it('uses active catalogue prices with repeats, honours explicit overrides and flags unresolved generated codes', async (): Promise<void> => {
    const equipment = {
      id: randomUUID(),
      sku: 'EQ',
      description: 'Equipment',
      unit: 'unit',
      price: '141.2000',
      status: 'active',
      equipmentRole: 'indoor',
    };
    const pipe = {
      id: randomUUID(),
      sku: 'IN-PI',
      description: 'Pipe',
      unit: 'metre',
      price: '40.1000',
      status: 'active',
      equipmentRole: 'pipe',
    };
    const module = await Test.createTestingModule({
      providers: [
        EstimatePricingService,
        {
          provide: CatalogueItemService,
          useValue: {
            getByIds: jest.fn().mockResolvedValue([equipment, pipe]),
            getActiveBySkus: jest.fn().mockResolvedValue([pipe]),
          },
        },
      ],
    }).compile();
    const service = module.get(EstimatePricingService);
    const area: IEstimateArea = {
      id: randomUUID(),
      name: 'טיפוס א',
      repeatCount: 3,
      lines: [
        {
          id: randomUUID(),
          catalogueItemId: equipment.id,
          quantity: '2',
          measurements: {
            equipment: 'mini-central',
            pipeMetresIncludingRise: 2.2,
            shelterSupply: false,
            distribution: {
              kind: 'none',
              catalogueCode: '',
              metres: 0,
              bends: 0,
            },
          },
        },
        { id: randomUUID(), catalogueItemId: pipe.id, quantity: '5.5' },
      ],
    };
    const lines = await service.calculate(
      [area],
      ESTIMATE_SCOPE.HVAC,
      new Transaction(
        new Sequelize({ dialect: 'postgres', logging: false }),
        {},
      ),
    );
    expect(
      lines.map(({ sku, quantity, total, source }) => ({
        sku,
        quantity,
        total,
        source,
      })),
    ).toEqual([
      { sku: 'EQ', quantity: '6.0000', total: '847.20', source: 'manual' },
      { sku: 'IN-PI', quantity: '16.5000', total: '661.65', source: 'manual' },
      { sku: 'IN-TH', quantity: '6.0000', total: null, source: 'rule' },
    ]);
    expect(estimateSubtotal(lines)).toBe('1508.85');
    await module.close();
  });
});
