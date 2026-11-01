import {
  makeCustomerProjectUser,
  makeCustomerProjectType,
  makeCustomerProjectSource,
  makeCustomerProjectParent,
  CUSTOMER_PROJECT_TEST_IDS,
} from '../../../testing/customer-project.fixture';

import { USER_ROLES } from '@Constants/user-role.constant';
import { toCustomerProjectItem } from './customer-project.utility';
import { CUSTOMER_PROJECT_KINDS } from '../constants/customer-project.constant';
import { IProjectMember } from '@Modules/project-member/interfaces/project-member.interface';

const member = (): IProjectMember => ({
  id: 'membership',
  userId: CUSTOMER_PROJECT_TEST_IDS.MEMBER,
  projectId: CUSTOMER_PROJECT_TEST_IDS.PROJECT,
  role: USER_ROLES.ENGINEER,
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
  user: makeCustomerProjectUser(),
});

describe('customer project row projection', () => {
  it('classifies a standalone project without a building count/context', () => {
    const item = toCustomerProjectItem(
      makeCustomerProjectSource({ apartmentCount: 8 }),
    );
    expect(item.kind).toBe(CUSTOMER_PROJECT_KINDS.PROJECT);
    expect(item.apartmentCount).toBe(0);
    expect(item.building).toBeNull();
    expect(item.members).toEqual([]);
  });

  it('shows an owned building once with its actual active-apartment count', () => {
    const item = toCustomerProjectItem(
      makeCustomerProjectSource({
        projectType: makeCustomerProjectType({ canHaveApartments: true }),
        apartmentCount: 64,
      }),
    );
    expect(item.kind).toBe(CUSTOMER_PROJECT_KINDS.BUILDING);
    expect(item.apartmentCount).toBe(64);
  });

  it('treats an apartment as an apartment even though its project type can contain apartments', () => {
    const parent = makeCustomerProjectParent();
    const item = toCustomerProjectItem(
      makeCustomerProjectSource({
        parentProjectId: parent.id,
        parentProject: parent,
        customerFloor: 7,
        projectType: makeCustomerProjectType({ canHaveApartments: true }),
      }),
    );
    expect(item.kind).toBe(CUSTOMER_PROJECT_KINDS.APARTMENT);
    expect(item.apartmentCount).toBe(0);
    expect(item.building).toEqual({
      id: parent.id,
      name: parent.name,
      code: parent.code,
    });
    expect(item.customerFloor).toBe(7);
    expect(item.building).not.toHaveProperty('notes');
    expect(item.building).not.toHaveProperty('customerId');
  });

  it('uses the parent team for an inheriting apartment, not stale stored apartment memberships', () => {
    const inherited = member();
    const stale = {
      ...member(),
      user: { ...makeCustomerProjectUser(), firstName: 'ישן' },
    };
    const parent = makeCustomerProjectParent({ members: [inherited] });
    const item = toCustomerProjectItem(
      makeCustomerProjectSource({
        parentProjectId: parent.id,
        parentProject: parent,
        members: [stale],
        hasOwnTeam: false,
      }),
    );
    expect(item.members).toEqual([
      { user: { id: inherited.userId, firstName: 'אורי', lastName: 'כהן' } },
    ]);
    expect(item.members[0].user).not.toHaveProperty('passwordHash');
    expect(item.members[0].user).not.toHaveProperty('phone');
    expect(item.members[0].user).not.toHaveProperty('email');
  });

  it('uses an explicitly independent apartment team, including an empty team', () => {
    const parent = makeCustomerProjectParent({ members: [member()] });
    const own = {
      ...member(),
      user: { ...makeCustomerProjectUser(), firstName: 'עצמאי' },
    };
    const source = makeCustomerProjectSource({
      parentProjectId: parent.id,
      parentProject: parent,
      members: [own],
      hasOwnTeam: true,
    });
    expect(toCustomerProjectItem(source).members[0].user?.firstName).toBe(
      'עצמאי',
    );
    expect(toCustomerProjectItem({ ...source, members: [] }).members).toEqual(
      [],
    );
  });

  it('does not assume associations or active employee data are always present', () => {
    const { user: removedUser, ...withoutUser } = member();
    expect(removedUser).toBeDefined();
    const item = toCustomerProjectItem(
      makeCustomerProjectSource({ members: [withoutUser] }),
    );
    expect(item.members).toEqual([{ user: null }]);
    expect(item.stage).toBeNull();
  });
});
