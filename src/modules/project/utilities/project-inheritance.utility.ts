import {
  TBuildingInheritance,
  IApartmentInheritance,
  TApartmentInheritanceInput,
} from '../interfaces/project.interface';

import { USER_ROLES } from '@Constants/user-role.constant';
import { ADDRESS_INHERITED_FIELDS } from '../constants/project-inheritance.constant';

export const resolveApartment = <TApartment extends TApartmentInheritanceInput>(
  apartment: TApartment,
  building: TBuildingInheritance,
): TApartment & IApartmentInheritance => {
  const customerDetails = apartment.customer
    ? {
        customerName: apartment.customer.name,
        customerPhone: apartment.customer.phone,
        contactName: apartment.customer.contactName,
        contactPhone: apartment.customer.phone,
        contactRole: null,
      }
    : {};

  return {
    ...apartment,
    ...customerDetails,
    members: apartment.hasOwnTeam
      ? (apartment.members ?? [])
      : [
          ...(building.members ?? []).filter(
            (member) => member.role !== USER_ROLES.ENGINEER,
          ),
          ...(apartment.members ?? []).filter(
            (member) => member.role === USER_ROLES.ENGINEER,
          ),
        ],
    address: building.address,
    parentNotes: building.notes,
    addressCity: building.addressCity,
    addressPlaceId: building.addressPlaceId,
    hasGeneralLightingCeilingLowering: apartment.hasOwnLighting
      ? apartment.hasGeneralLightingCeilingLowering
      : building.hasGeneralLightingCeilingLowering,
    generalLightingCeilingLoweringHeight: apartment.hasOwnLighting
      ? apartment.generalLightingCeilingLoweringHeight
      : building.generalLightingCeilingLoweringHeight,
    inheritedFields: [...ADDRESS_INHERITED_FIELDS],
  };
};
