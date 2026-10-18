import { Includeable } from 'sequelize';
import { Customer } from '@Modules/customer/entities/customer.entity';

export const CUSTOMER_SEARCH_INCLUDE: Includeable = {
  model: Customer,
  attributes: [],
  paranoid: false,
};
