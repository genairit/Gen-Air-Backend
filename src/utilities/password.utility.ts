import { PASSWORD_HASHING } from '@Constants/password.constant';
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

const deriveKey = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_HASHING.KEY_LENGTH, (error, key) => {
      if (error) {
        reject(error);

        return;
      }

      resolve(key);
    });
  });

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(PASSWORD_HASHING.SALT_BYTES);
  const key = await deriveKey(password, salt);

  return [salt.toString('hex'), key.toString('hex')].join(
    PASSWORD_HASHING.SEPARATOR,
  );
};

export const verifyPassword = async (
  password: string,
  storedHash: string,
): Promise<boolean> => {
  const [saltHex, keyHex] = storedHash.split(PASSWORD_HASHING.SEPARATOR);

  if (!saltHex || !keyHex) {
    return false;
  }

  const storedKey = Buffer.from(keyHex, 'hex');
  const derivedKey = await deriveKey(password, Buffer.from(saltHex, 'hex'));
  const hasMatchingLength = storedKey.length === derivedKey.length;

  return hasMatchingLength && timingSafeEqual(storedKey, derivedKey);
};
