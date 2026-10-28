import {
  LEGACY_CONTACT_ISSUE,
  LEGACY_CONTACT_SOURCE,
} from '../constants/customer-contact-migration.constant';

export type LegacyContactSourceType =
  (typeof LEGACY_CONTACT_SOURCE)[keyof typeof LEGACY_CONTACT_SOURCE];
export type LegacyContactIssueType =
  (typeof LEGACY_CONTACT_ISSUE)[keyof typeof LEGACY_CONTACT_ISSUE];

export type TLegacyContactRawFields = Readonly<Record<string, string | null>>;

export interface ILegacyCustomerContactRecord {
  id: string;
  phone: string;
  email: string;
  contactName: string;
}

export interface ILegacyProjectContactRecord {
  id: string;
  customerId: string | null;
  contactName: string | null;
  contactRole: string | null;
  contactPhone: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
}

export interface ILegacyContactSource {
  sourceId: string;
  customerId: string | null;
  kind: LegacyContactSourceType;
  rawFields: TLegacyContactRawFields;
}

export interface ILegacyContactIssue {
  kind: LegacyContactIssueType;
  sources: readonly ILegacyContactSource[];
}

export interface ILegacyContactInventory {
  issues: readonly ILegacyContactIssue[];
  sources: readonly ILegacyContactSource[];
}

export interface ILegacyContactInventoryInput {
  projects: readonly ILegacyProjectContactRecord[];
  customers: readonly ILegacyCustomerContactRecord[];
}
