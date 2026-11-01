import {
  ICustomerProjectItem,
  ICustomerProjectSource,
} from '../interfaces/customer-project.interface';

import { CUSTOMER_PROJECT_KINDS } from '../constants/customer-project.constant';

export const toCustomerProjectItem = (
  project: ICustomerProjectSource,
): ICustomerProjectItem => {
  const isApartment = Boolean(project.parentProjectId);
  const isBuilding =
    !isApartment && Boolean(project.projectType?.canHaveApartments);
  const parent = project.parentProject ?? null;
  const members =
    isApartment && !project.hasOwnTeam ? parent?.members : project.members;
  const kind = isApartment
    ? CUSTOMER_PROJECT_KINDS.APARTMENT
    : CUSTOMER_PROJECT_KINDS.PROJECT;

  return {
    id: project.id,
    name: project.name,
    code: project.code,
    stageId: project.stageId,
    updatedAt: project.updatedAt,
    kind: isBuilding ? CUSTOMER_PROJECT_KINDS.BUILDING : kind,
    stage: project.stage ?? null,
    projectType: project.projectType ?? null,
    apartmentCount: isBuilding ? project.apartmentCount : 0,
    customerFloor: project.customerFloor,
    parentProjectId: project.parentProjectId,
    building:
      isApartment && parent
        ? { id: parent.id, name: parent.name, code: parent.code }
        : null,
    members: (members ?? []).map(({ user }) => ({
      user: user
        ? {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
          }
        : null,
    })),
  };
};
