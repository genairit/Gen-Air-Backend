import {
  hashPassword,
  verifyPassword,
  isBlockedPassword,
} from '@Utilities/password.utility';

import { parseArgs } from 'node:util';
import { Writable } from 'node:stream';
import { AppModule } from '../app.module';
import { NestFactory } from '@nestjs/core';
import { createInterface } from 'node:readline';
import { UserRepository } from '@Modules/user/user.repository';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const options = {
  audit: { type: 'boolean' },
  email: { type: 'string' },
} as const;

const readNewPassword = async (): Promise<string> => {
  const mutedOutput = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const prompt = createInterface({
    input: process.stdin,
    output: mutedOutput,
    terminal: process.stdin.isTTY,
  });
  process.stderr.write('New password: ');
  try {
    return await new Promise<string>((resolve) => prompt.question('', resolve));
  } finally {
    prompt.close();
    process.stderr.write('\n');
  }
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({ options });
  if (Boolean(values.audit) === Boolean(values.email)) {
    throw new Error('Pass exactly one of --audit or --email <employee-email>');
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const users = app.get(UserRepository);
    if (values.audit) {
      const credentials = await users.findAllCredentials();
      const affected: string[] = [];
      for (const user of credentials) {
        if (await verifyPassword('temp1234', user.passwordHash)) {
          affected.push(user.email);
        }
      }
      affected.forEach((email) => process.stdout.write(`${email}\n`));
      process.stdout.write(`Affected accounts: ${affected.length}\n`);
      return;
    }

    const email = values.email;
    if (!email) {
      throw new Error('Employee email is required');
    }

    const password = await readNewPassword();
    if (
      password.length < 8 ||
      password.length > 128 ||
      isBlockedPassword(password)
    ) {
      throw new Error('New password does not meet the password policy');
    }
    const target = await users.findCredentialsByEmail(email);
    if (!target || !(await verifyPassword('temp1234', target.passwordHash))) {
      throw new Error(
        'No active account with the former shared password was found',
      );
    }

    const hash = await hashPassword(password);
    await app.get(DatabaseTransactionService).run(async (transaction) => {
      const locked = await users.findCredentialsById(target.id, transaction);
      if (!locked || !(await verifyPassword('temp1234', locked.passwordHash))) {
        throw new Error('The account password changed before rotation');
      }
      await users.updatePasswordHash(target.id, hash, transaction);
    });
    process.stdout.write(`Rotated password for ${email}\n`);
  } finally {
    await app.close();
  }
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Rotation failed'}\n`,
  );
  process.exitCode = 1;
});
