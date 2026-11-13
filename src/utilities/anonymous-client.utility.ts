import { TIME_UNITS } from '@Constants/time.constant';
import { COOKIE_KEYS } from '@Constants/storage.constant';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

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
    .find((part) => part.startsWith(`${COOKIE_KEYS.ANONYMOUS_CLIENT}=`))
    ?.slice(COOKIE_KEYS.ANONYMOUS_CLIENT.length + 1) ?? null;

export const createAnonymousClient = (
  secret: string,
): { clientId: string; token: string } => {
  const clientId = randomBytes(16).toString('hex');
  return { clientId, token: signAnonymousClient(clientId, secret) };
};

export const anonymousClientSetCookie = (token: string): string =>
  `${COOKIE_KEYS.ANONYMOUS_CLIENT}=${token}; Path=/; Max-Age=${TIME_UNITS.DAY_MS / TIME_UNITS.SECOND_MS}; HttpOnly; Secure; SameSite=Strict`;
