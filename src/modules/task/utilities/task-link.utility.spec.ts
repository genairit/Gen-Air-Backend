import {
  toTaskLink,
  isTaskLinkRequested,
  resolveTaskCustomerId,
} from './task-link.utility';

const PROJECT_ID = '00000000-0000-4000-8000-000000000002';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_CUSTOMER_ID = '00000000-0000-4000-8000-000000000004';

describe('task link contract', () => {
  it('keeps exactly one link and clears the other', () => {
    expect(toTaskLink({ projectId: PROJECT_ID })).toEqual({
      projectId: PROJECT_ID,
      customerId: null,
    });
    expect(toTaskLink({ projectId: null, customerId: CUSTOMER_ID })).toEqual({
      projectId: null,
      customerId: CUSTOMER_ID,
    });
  });

  it('rejects both links and no link', () => {
    expect(
      toTaskLink({ projectId: PROJECT_ID, customerId: CUSTOMER_ID }),
    ).toBeNull();
    expect(toTaskLink({})).toBeNull();
    expect(toTaskLink({ projectId: null, customerId: null })).toBeNull();
  });

  it('detects whether an input touches the link', () => {
    expect(isTaskLinkRequested({})).toBe(false);
    expect(isTaskLinkRequested({ projectId: null })).toBe(true);
    expect(isTaskLinkRequested({ customerId: CUSTOMER_ID })).toBe(true);
  });

  it('resolves the customer of customer, project, apartment and legacy tasks', () => {
    const project = { id: PROJECT_ID, code: 'P', name: 'P' };
    const projectCustomer = { id: OTHER_CUSTOMER_ID, name: 'Owner' };
    const projectTask = {
      customerId: null,
      project: { ...project, customer: projectCustomer },
    };

    expect(
      resolveTaskCustomerId({ customerId: CUSTOMER_ID, project: null }),
    ).toBe(CUSTOMER_ID);
    expect(resolveTaskCustomerId(projectTask)).toBe(OTHER_CUSTOMER_ID);
    expect(
      resolveTaskCustomerId({ ...projectTask, customerId: CUSTOMER_ID }),
    ).toBe(CUSTOMER_ID);
    expect(resolveTaskCustomerId({ customerId: null, project })).toBeNull();
    expect(
      resolveTaskCustomerId({
        customerId: null,
        project: {
          ...project,
          customer: null,
          parentProject: { ...project, customer: projectCustomer },
        },
      }),
    ).toBe(OTHER_CUSTOMER_ID);
  });
});
