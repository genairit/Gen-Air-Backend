import {
  LEGACY_CONTACT_ISSUE,
  LEGACY_CONTACT_SOURCE,
} from '../constants/customer-contact-migration.constant';

import { inspectLegacyContactSources } from './customer-contact-migration.utility';

const customer = {
  id: 'customer-1',
  phone: '031234567',
  email: 'customer@example.com',
  contactName: '  דנה  ',
};
const project = {
  id: 'project-1',
  customerId: customer.id,
  customerName: 'זהות לקוח',
  customerPhone: '0501234567',
  customerEmail: 'legacy@example.com',
  contactName: 'איש קשר אתר',
  contactPhone: '0521234567',
  contactRole: 'מנהל אתר',
};

describe('legacy contact preservation inventory', () => {
  it('retains separate raw fields and provenance without assigning ownership', () => {
    const input = { customers: [customer], projects: [project] };
    const before = JSON.stringify(input);
    const result = inspectLegacyContactSources(input);
    expect(result.sources).toEqual([
      {
        sourceId: customer.id,
        customerId: customer.id,
        kind: LEGACY_CONTACT_SOURCE.CUSTOMER,
        rawFields: {
          contactName: customer.contactName,
          phone: customer.phone,
          email: customer.email,
        },
      },
      {
        sourceId: project.id,
        customerId: customer.id,
        kind: LEGACY_CONTACT_SOURCE.PROJECT_CONTACT,
        rawFields: {
          contactName: project.contactName,
          contactPhone: project.contactPhone,
          contactRole: project.contactRole,
        },
      },
      {
        sourceId: project.id,
        customerId: customer.id,
        kind: LEGACY_CONTACT_SOURCE.PROJECT_CUSTOMER,
        rawFields: {
          customerName: project.customerName,
          customerPhone: project.customerPhone,
          customerEmail: project.customerEmail,
        },
      },
    ]);
    expect(result.issues).toEqual([]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([null, 'missing-customer'])(
    'reports orphan sources for customer %s without dropping them',
    (customerId) => {
      const result = inspectLegacyContactSources({
        customers: [customer],
        projects: [{ ...project, customerId }],
      });
      expect(result.sources).toHaveLength(3);
      expect(result.issues).toHaveLength(2);
      expect(
        result.issues.every(
          ({ kind }) => kind === LEGACY_CONTACT_ISSUE.UNLINKED,
        ),
      ).toBe(true);
    },
  );

  it('retains identical source records instead of merging them', () => {
    const result = inspectLegacyContactSources({
      customers: [customer],
      projects: [project, { ...project, id: 'project-2' }],
    });
    expect(result.sources).toHaveLength(5);
    expect(result.issues).toEqual([]);
  });

  it('reports differing project snapshots as possible conflicts without choosing a winner', () => {
    const other = { ...project, id: 'project-2', contactPhone: '0531234567' };
    const result = inspectLegacyContactSources({
      customers: [customer],
      projects: [project, other],
    });
    expect(result.sources).toHaveLength(5);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe(LEGACY_CONTACT_ISSUE.POSSIBLE_CONFLICT);
    expect(result.issues[0].sources.map(({ sourceId }) => sourceId)).toEqual([
      project.id,
      other.id,
    ]);
  });

  it('retains empty raw snapshots but does not report them as orphan contacts', () => {
    const result = inspectLegacyContactSources({
      customers: [],
      projects: [
        {
          id: project.id,
          customerId: null,
          customerName: null,
          customerPhone: '',
          customerEmail: null,
          contactName: '',
          contactPhone: null,
          contactRole: null,
        },
      ],
    });
    expect(result.sources).toHaveLength(2);
    expect(result.issues).toEqual([]);
  });
});
