import type { IProject } from '@Modules/project/interfaces/project.interface';
import type { IQuotationApartment } from '../interfaces/quotation-project.interface';

const APARTMENT_NUMBER_COLLATOR = new Intl.Collator('he', { numeric: true });

const compareFloors = (first: number | null, second: number | null): number =>
  (first ?? Number.MAX_SAFE_INTEGER) - (second ?? Number.MAX_SAFE_INTEGER);

const compareApartments = (
  first: IQuotationApartment,
  second: IQuotationApartment,
): number =>
  APARTMENT_NUMBER_COLLATOR.compare(
    first.apartmentNumber ?? '',
    second.apartmentNumber ?? '',
  ) || compareFloors(first.floor, second.floor);

export const sortApartments = <TApartment extends IQuotationApartment>(
  apartments: TApartment[],
): TApartment[] => [...apartments].sort(compareApartments);

export const toQuotationApartment = (
  apartment: IProject,
): IQuotationApartment => ({
  apartmentId: apartment.id,
  floor: apartment.customerFloor,
  apartmentNumber: apartment.customerApartment,
  endCustomerName: apartment.customer?.name ?? apartment.customerName ?? null,
});
