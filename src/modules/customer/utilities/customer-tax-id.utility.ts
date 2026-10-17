import { UniqueConstraintError } from 'sequelize';

export const isCustomerTaxIdConflict = (error: unknown): boolean => {
  if (!(error instanceof UniqueConstraintError)) {
    return false;
  }

  const constraint: unknown = Reflect.get(error.parent, 'constraint');
  return constraint === 'uq_customers_tax_id';
};
