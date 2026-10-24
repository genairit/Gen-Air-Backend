import { Includeable } from 'sequelize';
import { Customer } from '../entities/customer.entity';

export const CUSTOMER_REFERENCE_ATTRIBUTES = ['id', 'name'] as const;

export type CustomerReferenceAttributeType =
  (typeof CUSTOMER_REFERENCE_ATTRIBUTES)[number];

// Sequelize normalizes include objects in place, so each nesting level needs its own instance.
export const buildCustomerReferenceInclude = (): Includeable => ({
  model: Customer,
  paranoid: false,
  attributes: [...CUSTOMER_REFERENCE_ATTRIBUTES],
});
