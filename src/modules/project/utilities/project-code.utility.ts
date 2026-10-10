import {
  PROJECT_CODE,
  PROJECT_CODE_SERIAL_UPPER_BOUND,
} from '../constants/project-code.constant';

import { randomInt } from 'node:crypto';
import { IUser } from '@Modules/user/interfaces/user.interface';

type TProjectCreatorName = Pick<IUser, 'firstName' | 'lastName'>;

const getInitial = (name: string): string => [...name.trim()].at(0) ?? '';

export const formatProjectCode = (
  creator: TProjectCreatorName,
  serial: number,
): string => {
  const initials = `${getInitial(creator.firstName)}${getInitial(creator.lastName)}`;
  const paddedSerial = serial
    .toString()
    .padStart(PROJECT_CODE.SERIAL_DIGITS, '0');

  return `${initials}${PROJECT_CODE.SEPARATOR}${paddedSerial}`;
};

export const generateProjectCode = (creator: TProjectCreatorName): string =>
  formatProjectCode(creator, randomInt(PROJECT_CODE_SERIAL_UPPER_BOUND));
