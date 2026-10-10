import { hashPassword, verifyPassword } from './password.utility';

describe('password utility', () => {
  it('verifies the original password against its hash', async () => {
    const hash = await hashPassword('genair2026');

    await expect(verifyPassword('genair2026', hash)).resolves.toBe(true);
  });

  it('rejects a different password', async () => {
    const hash = await hashPassword('genair2026');

    await expect(verifyPassword('genair2027', hash)).resolves.toBe(false);
  });

  it('salts every hash differently', async () => {
    const [firstHash, secondHash] = await Promise.all([
      hashPassword('temp1234'),
      hashPassword('temp1234'),
    ]);

    expect(firstHash).not.toBe(secondHash);
  });

  it('rejects a malformed stored hash', async () => {
    await expect(verifyPassword('temp1234', 'not-a-hash')).resolves.toBe(false);
  });
});
