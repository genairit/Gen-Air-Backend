import { getDriveConnectionFailure } from './drive-connection.utility';
import { DRIVE_CONNECTION_STATUS } from '../constants/drive-connection.constant';

describe('getDriveConnectionFailure', () => {
  it.each([
    new Error(
      'Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started',
    ),
    { code: 'ENOENT' },
    { response: { status: 401 } },
  ])('identifies a provider authentication failure', (error) => {
    expect(getDriveConnectionFailure(error)).toBe(
      DRIVE_CONNECTION_STATUS.AUTHENTICATION_FAILED,
    );
  });

  it.each([
    [403, DRIVE_CONNECTION_STATUS.ACCESS_DENIED],
    [404, DRIVE_CONNECTION_STATUS.ROOT_NOT_FOUND],
    [503, DRIVE_CONNECTION_STATUS.UNAVAILABLE],
  ])('preserves the distinct provider status %s', (status, expected) => {
    expect(getDriveConnectionFailure({ response: { status } })).toBe(expected);
  });

  it.each([
    new Error('quota exceeded'),
    null,
    'Could not load the default credentials',
  ])('keeps unrelated or malformed failures unavailable', (error) => {
    expect(getDriveConnectionFailure(error)).toBe(
      DRIVE_CONNECTION_STATUS.UNAVAILABLE,
    );
  });
});
