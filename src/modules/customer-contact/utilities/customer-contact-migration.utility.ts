import {
  LEGACY_CONTACT_ISSUE,
  LEGACY_CONTACT_SOURCE,
} from '../constants/customer-contact-migration.constant';

import {
  ILegacyContactSource,
  ILegacyContactInventory,
  ILegacyProjectContactRecord,
  ILegacyContactInventoryInput,
  ILegacyCustomerContactRecord,
} from '../interfaces/customer-contact-migration.interface';

export const inspectLegacyContactSources = ({
  customers,
  projects,
}: ILegacyContactInventoryInput): ILegacyContactInventory => {
  const sources = [
    ...customers.map(customerContactSource),
    ...projects.flatMap(projectContactSources),
  ];
  const populatedSources = sources.filter(hasLegacyValues);
  const unlinked = populatedSources.filter((source) => {
    const linkedCustomerExists = customers.some(
      ({ id }) => id === source.customerId,
    );
    return !linkedCustomerExists;
  });
  const possibleConflicts = findPossibleConflicts(populatedSources);
  return {
    sources,
    issues: [
      ...unlinked.map((source) => ({
        kind: LEGACY_CONTACT_ISSUE.UNLINKED,
        sources: [source],
      })),
      ...possibleConflicts.map((group) => ({
        kind: LEGACY_CONTACT_ISSUE.POSSIBLE_CONFLICT,
        sources: group,
      })),
    ],
  };
};

const customerContactSource = ({
  id,
  phone,
  email,
  contactName,
}: ILegacyCustomerContactRecord): ILegacyContactSource => ({
  sourceId: id,
  customerId: id,
  kind: LEGACY_CONTACT_SOURCE.CUSTOMER,
  rawFields: { contactName, phone, email },
});

const projectContactSources = ({
  id,
  customerId,
  contactName,
  contactRole,
  contactPhone,
  customerName,
  customerPhone,
  customerEmail,
}: ILegacyProjectContactRecord): ILegacyContactSource[] => [
  {
    customerId,
    sourceId: id,
    kind: LEGACY_CONTACT_SOURCE.PROJECT_CONTACT,
    rawFields: { contactName, contactPhone, contactRole },
  },
  {
    customerId,
    sourceId: id,
    kind: LEGACY_CONTACT_SOURCE.PROJECT_CUSTOMER,
    rawFields: { customerName, customerPhone, customerEmail },
  },
];

const hasLegacyValues = ({ rawFields }: ILegacyContactSource): boolean =>
  Object.values(rawFields).some((value) => value !== null && value !== '');

const findPossibleConflicts = (
  sources: readonly ILegacyContactSource[],
): ILegacyContactSource[][] => {
  const groups = new Map<string, ILegacyContactSource[]>();
  sources.forEach((source) => {
    if (source.customerId === null) {
      return;
    }

    const groupKey = JSON.stringify([source.customerId, source.kind]);
    const group = groups.get(groupKey) ?? [];
    groups.set(groupKey, [...group, source]);
  });
  return [...groups.values()].filter((group) => {
    const distinctSnapshots = new Set(
      group.map(({ rawFields }) => JSON.stringify(rawFields)),
    );
    return distinctSnapshots.size > 1;
  });
};
