import { USER_ROLES } from '@Constants/user-role.constant';
import { resolveApartment } from './project-inheritance.utility';
import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';
import { ICustomer } from '@Modules/customer/interfaces/customer.interface';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';
import { IProjectMember } from '@Modules/project-member/interfaces/project-member.interface';

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

const FIXTURE_DATE = new Date('2026-10-24T00:00:00.000Z');
const BUILDING_MEMBER: IProjectMember = {
  id: 'building-member',
  userId: 'engineer-1',
  projectId: 'building-1',
  role: USER_ROLES.ENGINEER,
  createdAt: FIXTURE_DATE,
  updatedAt: FIXTURE_DATE,
};
const APARTMENT_MEMBER: IProjectMember = {
  ...BUILDING_MEMBER,
  id: 'apartment-member',
  userId: 'engineer-2',
  projectId: APARTMENT.id,
};
const LINKED_CUSTOMER: ICustomer = {
  id: 'apartment-customer',
  name: 'משפחת כהן',
  phone: '052-1112233',
  email: 'cohen@example.com',
  taxId: '123456789',
  address: 'תל אביב',
  contactName: 'דנה כהן',
  customerType: PROJECT_DETAIL_FIELD_SETS.PRIVATE_CLIENT,
  createdById: 'user-1',
  createdAt: FIXTURE_DATE,
  updatedAt: FIXTURE_DATE,
  deletedAt: null,
  priorityId: null,
  prioritySyncedAt: null,
  prioritySyncError: null,
  prioritySyncAttempts: 0,
  prioritySyncStatus: 'pending',
};

describe('resolveApartment team inheritance', () => {
  it('inherits the current building team without storing it on the apartment', () => {
    const apartment = { ...APARTMENT, hasOwnTeam: false, members: [] };
    const building = { ...BUILDING, members: [BUILDING_MEMBER] };
    expect(resolveApartment(apartment, building).members).toEqual([
      BUILDING_MEMBER,
    ]);
    expect(apartment.members).toEqual([]);
  });

  it('tracks later changes to the building team while inherited', () => {
    const apartment = { ...APARTMENT, hasOwnTeam: false };
    expect(
      resolveApartment(apartment, { ...BUILDING, members: [BUILDING_MEMBER] })
        .members,
    ).toEqual([BUILDING_MEMBER]);
    expect(
      resolveApartment(apartment, { ...BUILDING, members: [APARTMENT_MEMBER] })
        .members,
    ).toEqual([APARTMENT_MEMBER]);
  });

  it('preserves an apartment-only team instead of the building team', () => {
    const apartment = {
      ...APARTMENT,
      hasOwnTeam: true,
      members: [APARTMENT_MEMBER],
    };
    const building = { ...BUILDING, members: [BUILDING_MEMBER] };
    expect(resolveApartment(apartment, building).members).toEqual([
      APARTMENT_MEMBER,
    ]);
    expect(building.members).toEqual([BUILDING_MEMBER]);
  });

  it('keeps an explicitly empty own team empty', () => {
    const apartment = { ...APARTMENT, hasOwnTeam: true, members: [] };
    expect(
      resolveApartment(apartment, { ...BUILDING, members: [BUILDING_MEMBER] })
        .members,
    ).toEqual([]);
  });

  it('returns an empty team for an inherited apartment when the building has none', () => {
    expect(
      resolveApartment({ ...APARTMENT, hasOwnTeam: false }, BUILDING).members,
    ).toEqual([]);
  });
});

describe('resolveApartment customer and legacy details', () => {
  it('reads end-customer and contact details from the linked customer rather than stale text', () => {
    const apartment = {
      ...APARTMENT,
      customer: LINKED_CUSTOMER,
      customerName: 'Old customer name',
      customerPhone: '03-5551234',
      contactName: 'Old contact name',
      contactPhone: '050-0000000',
      contactRole: 'Old role',
    };
    expect(resolveApartment(apartment, BUILDING)).toMatchObject({
      customerName: LINKED_CUSTOMER.name,
      customerPhone: LINKED_CUSTOMER.phone,
      contactName: LINKED_CUSTOMER.contactName,
      contactPhone: LINKED_CUSTOMER.phone,
      contactRole: null,
    });
  });

  it('keeps stored free-text end-customer and contact details on a legacy apartment', () => {
    const apartment = {
      ...APARTMENT,
      customerName: 'Legacy resident',
      customerPhone: '03-5551234',
      contactName: 'Legacy contact',
      contactPhone: '050-1112233',
      contactRole: 'דייר',
    };
    expect(resolveApartment(apartment, BUILDING)).toMatchObject({
      customerName: apartment.customerName,
      customerPhone: apartment.customerPhone,
      contactName: apartment.contactName,
      contactPhone: apartment.contactPhone,
      contactRole: apartment.contactRole,
    });
  });

  it('does not inherit the building customer as the apartment end customer', () => {
    const apartment = { ...APARTMENT, customerName: null, customerPhone: null };
    const building = { ...BUILDING, customer: LINKED_CUSTOMER };
    expect(resolveApartment(apartment, building)).toMatchObject({
      customerName: null,
      customerPhone: null,
    });
  });
});
