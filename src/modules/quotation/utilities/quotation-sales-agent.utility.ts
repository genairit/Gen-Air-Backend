import type { IUser } from '@Modules/user/interfaces/user.interface';

export const salesAgentDisplayName = (
  agent: Pick<IUser, 'firstName' | 'lastName' | 'employeeNumber'>,
): string => `${agent.firstName} ${agent.lastName} · ${agent.employeeNumber}`;
