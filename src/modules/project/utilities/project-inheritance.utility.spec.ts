import { resolveApartment } from './project-inheritance.utility';
import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';

const BUILDING = {
  notes: 'תמ״א 38',
  address: 'דרך נמיר 94, תל אביב-יפו',
  addressCity: 'תל אביב-יפו',
  addressPlaceId: 'ChIJ-building',
  paymentTermsNote: null,
  paymentTerms: PAYMENT_TERMS.MILESTONES_NET_60,
};

const APARTMENT = {
  id: 'apartment-1',
  notes: 'גישה דרך חדר המדרגות המזרחי',
  address: null,
  addressCity: null,
  paymentTerms: null,
  addressPlaceId: null,
  paymentTermsNote: null,
};

describe('resolveApartment', () => {
  it('takes the address, payment terms and notes from the building', () => {
    const resolved = resolveApartment(APARTMENT, BUILDING);

    expect(resolved).toMatchObject({
      address: BUILDING.address,
      parentNotes: 'תמ״א 38',
      addressPlaceId: 'ChIJ-building',
      notes: APARTMENT.notes,
      paymentTerms: PAYMENT_TERMS.MILESTONES_NET_60,
    });
    expect(resolved.inheritedFields).toEqual([
      'address',
      'addressCity',
      'addressPlaceId',
      'paymentTerms',
      'paymentTermsNote',
    ]);
  });

  it('keeps the apartment override and stops marking payment terms as inherited', () => {
    const resolved = resolveApartment(
      {
        ...APARTMENT,
        paymentTerms: PAYMENT_TERMS.OTHER,
        paymentTermsNote: 'תשלום מלא במסירה',
      },
      BUILDING,
    );

    expect(resolved).toMatchObject({
      paymentTerms: PAYMENT_TERMS.OTHER,
      paymentTermsNote: 'תשלום מלא במסירה',
    });
    expect(resolved.inheritedFields).toEqual([
      'address',
      'addressCity',
      'addressPlaceId',
    ]);
  });
});
