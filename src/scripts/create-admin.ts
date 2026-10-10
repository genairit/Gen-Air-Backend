import { parseArgs } from 'node:util';
import { AppModule } from '../app.module';
import { NestFactory } from '@nestjs/core';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { TypedLogger } from '@Logger/logger.service';
import { UserService } from '@Modules/user/user.service';
import { USER_ROLES } from '@Constants/user-role.constant';
import { CreateUserDto } from '@Modules/user/dto/create-user.dto';

const logger = new TypedLogger('CreateAdminScript');

const ADMIN_ARGUMENT_OPTIONS = {
  email: { type: 'string' },
  phone: { type: 'string' },
  password: { type: 'string' },
  'last-name': { type: 'string' },
  'first-name': { type: 'string' },
} as const;

const parseAdmin = (): CreateUserDto => {
  const { values } = parseArgs({ options: ADMIN_ARGUMENT_OPTIONS });

  return plainToInstance(CreateUserDto, {
    email: values.email,
    phone: values.phone,
    password: values.password,
    role: USER_ROLES.SYSTEM_ADMIN,
    lastName: values['last-name'],
    firstName: values['first-name'],
  });
};

const createAdmin = async () => {
  const admin = parseAdmin();
  const validationErrors = await validate(admin);

  if (validationErrors.length > 0) {
    logger.error({
      error: 'Invalid admin details',
      message: 'Failed to create the system admin',
      constraints: validationErrors.map((error) => error.constraints),
    });
    process.exitCode = 1;

    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const createdAdmin = await app.get(UserService).create(admin);

    logger.info({
      message: 'System admin created',
      employeeNumber: createdAdmin.employeeNumber,
    });
  } finally {
    await app.close();
  }
};

createAdmin().catch((error: unknown) => {
  logger.error({ error, message: 'Failed to create the system admin' });
  process.exitCode = 1;
});
