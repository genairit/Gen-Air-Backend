import { ICustomer } from '@Modules/customer/interfaces/customer.interface';
import { CreateCustomerDto } from '@Modules/customer/dto/create-customer.dto';

export interface IApartmentImportCustomerIdentity {
  taxId: string | null;
  errors: readonly string[];
}

export interface IApartmentImportNewCustomer {
  errors: readonly string[];
  customer: CreateCustomerDto | null;
}

export interface IApartmentImportCustomerComparison {
  customer: ICustomer;
  cells: readonly string[];
}

export interface IApartmentCustomerDeclarationInput {
  cells: readonly string[];
  previous: readonly string[] | null;
}

export interface IApartmentCustomerDeclaration {
  cells: readonly string[];
  errors: readonly string[];
}
