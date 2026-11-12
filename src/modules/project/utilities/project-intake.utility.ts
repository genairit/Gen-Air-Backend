import { TProjectIntakeInput } from '../interfaces/project.interface';

export const hasAddressChanges = (changes: TProjectIntakeInput): boolean =>
  'addressPlaceId' in changes;
