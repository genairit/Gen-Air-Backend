export const PASSWORD_HASHING = {
  SALT_BYTES: 16,
  KEY_LENGTH: 64,
  SEPARATOR: ':',
} as const;

export const DUMMY_PASSWORD_HASH = `${'00'.repeat(PASSWORD_HASHING.SALT_BYTES)}:${'00'.repeat(PASSWORD_HASHING.KEY_LENGTH)}`;

export const BLOCKED_PASSWORDS = ['temp1234'] as const;
