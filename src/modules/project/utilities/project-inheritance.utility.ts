import {
  TBuildingInheritance,
  IApartmentInheritance,
  TApartmentInheritanceInput,
} from '../interfaces/project.interface';

import {
  ADDRESS_INHERITED_FIELDS,
  PAYMENT_TERMS_INHERITED_FIELDS,
} from '../constants/project-inheritance.constant';

const hasOwnPaymentTerms = (apartment: TApartmentInheritanceInput): boolean =>
  apartment.paymentTerms !== null;

const pickPaymentTerms = (source: TApartmentInheritanceInput) => ({
  paymentTerms: source.paymentTerms,
  paymentTermsNote: source.paymentTermsNote,
});

export const resolveApartment = <TApartment extends TApartmentInheritanceInput>(
  apartment: TApartment,
  building: TBuildingInheritance,
): TApartment & IApartmentInheritance => {
  const isOverridingPaymentTerms = hasOwnPaymentTerms(apartment);
  const paymentTermsSource = isOverridingPaymentTerms ? apartment : building;
  const inheritedPaymentFields = isOverridingPaymentTerms
    ? []
    : PAYMENT_TERMS_INHERITED_FIELDS;

  return {
    ...apartment,
    ...pickPaymentTerms(paymentTermsSource),
    address: building.address,
    parentNotes: building.notes,
    addressCity: building.addressCity,
    addressPlaceId: building.addressPlaceId,
    inheritedFields: [...ADDRESS_INHERITED_FIELDS, ...inheritedPaymentFields],
  };
};
