import { CreateCustomerContactDto } from '../dto/create-customer-contact.dto';
import { ICustomerContactValues } from '../interfaces/customer-contact.interface';

export const normalizeCustomerContactValues = (
  input: CreateCustomerContactDto,
): ICustomerContactValues => ({
  name: input.name.trim(),
  phone: input.phone?.trim() || null,
  email: input.email?.trim() || null,
  role: input.role?.trim() || null,
});
