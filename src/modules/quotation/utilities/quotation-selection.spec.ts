import {
  assertUniqueQuotationIds,
  validateQuotationAccessories,
} from './quotation-selection.utility';

import { quotationItemFixture } from '../../../testing/quotation.fixture';
import type { IQuotationItem } from '@Modules/quotation-item/interfaces/quotation-item.interface';

const pair = (): { parent: IQuotationItem; control: IQuotationItem } => {
  const parent = { ...quotationItemFixture(), equipmentRole: 'indoor' };
  const control = {
    ...quotationItemFixture(),
    equipmentRole: 'control',
    controlKind: 'remote',
    parentItemId: parent.id,
  };
  return { parent, control };
};
describe('Accessory billing and structural rejection paths', () => {
  test('included remote cannot be charged again even with renamed line description', () => {
    const { parent, control } = pair();
    parent.includesRemote = true;
    control.description = 'renamed to bypass';
    expect(() => validateQuotationAccessories([parent, control])).toThrow(
      'כבר כלול',
    );
  });
  test('included thermostat cannot be charged again', () => {
    const { parent, control } = pair();
    parent.includesThermostat = true;
    control.controlKind = 'thermostat';
    expect(() => validateQuotationAccessories([parent, control])).toThrow(
      'כבר כלול',
    );
  });
  test('linked quantity must equal parent quantity', () => {
    const { parent, control } = pair();
    parent.quantity = '2';
    expect(() => validateQuotationAccessories([parent, control])).toThrow(
      'כמות הבקרים',
    );
  });
  test('controller may reference only an existing indoor unit in the same section', () => {
    const { parent, control } = pair();
    expect(() => validateQuotationAccessories([control])).toThrow();
    control.sectionId = 'other';
    expect(() => validateQuotationAccessories([parent, control])).toThrow();
    control.sectionId = parent.sectionId;
    parent.equipmentRole = 'unit';
    expect(() => validateQuotationAccessories([parent, control])).toThrow();
  });
  test('invalid child role and nested parent are rejected', () => {
    const { parent, control } = pair();
    control.equipmentRole = 'pipe';
    expect(() => validateQuotationAccessories([parent, control])).toThrow();
    control.equipmentRole = 'control';
    parent.parentItemId = 'another';
    expect(() => validateQuotationAccessories([parent, control])).toThrow();
  });
  test('valid linked control and unrelated standalone lines remain billable', () => {
    const { parent, control } = pair();
    expect(() =>
      validateQuotationAccessories([parent, control, quotationItemFixture()]),
    ).not.toThrow();
  });
  test('duplicate section or item identifiers rejected without deduplication', () => {
    expect(() => assertUniqueQuotationIds(['one', 'one'])).toThrow();
    expect(() => assertUniqueQuotationIds(['one', 'two'])).not.toThrow();
  });
});
