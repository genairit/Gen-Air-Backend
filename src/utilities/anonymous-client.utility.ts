import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { TIME_UNITS } from '@Constants/time.constant';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

const storageKeys: unknown = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '../../apps/questionnaire/public/constants/storage-keys.json',
    ),
    'utf8',
  ),
);
if (
  !storageKeys ||
  typeof storageKeys !== 'object' ||
  !('ANONYMOUS_CLIENT_COOKIE' in storageKeys) ||
  typeof storageKeys.ANONYMOUS_CLIENT_COOKIE !== 'string'
) {
  throw new Error('Anonymous client cookie storage key is missing');
}
export const ANONYMOUS_CLIENT_COOKIE = storageKeys.ANONYMOUS_CLIENT_COOKIE;
const CLIENT_PATTERN = /^([0-9a-f]{32})\.([0-9a-f]{64})$/;

export const signAnonymousClient = (
  clientId: string,
  secret: string,
): string => {
  const signature = createHmac('sha256', secret).update(clientId).digest('hex');
  return `${clientId}.${signature}`;
};

export const verifyAnonymousClient = (
  token: string | null,
  secret: string,
): string | null => {
  const match = token?.match(CLIENT_PATTERN);
  if (!match) {
    return null;
  }

  const [, clientId, suppliedSignature] = match;
  const expectedSignature = createHmac('sha256', secret)
    .update(clientId)
    .digest();
  const valid = timingSafeEqual(
    expectedSignature,
    Buffer.from(suppliedSignature, 'hex'),
  );
  return valid ? clientId : null;
};

export const readAnonymousClientCookie = (
  header: string | null,
): string | null =>
  header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ANONYMOUS_CLIENT_COOKIE}=`))
    ?.slice(ANONYMOUS_CLIENT_COOKIE.length + 1) ?? null;

export const createAnonymousClient = (
  secret: string,
): { clientId: string; token: string } => {
  const clientId = randomBytes(16).toString('hex');
  return { clientId, token: signAnonymousClient(clientId, secret) };
};

export const anonymousClientSetCookie = (token: string): string =>
  `${ANONYMOUS_CLIENT_COOKIE}=${token}; Path=/; Max-Age=${TIME_UNITS.DAY_MS / TIME_UNITS.SECOND_MS}; HttpOnly; Secure; SameSite=Strict`;
