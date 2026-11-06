import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthGuard } from '@Guards/auth.guard';
import { AuthController } from './auth.controller';
import { UserModule } from '@Modules/user/user.module';
import { LoginAttemptService } from './login-attempt.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';
import { RolePermissionModule } from '@Modules/role-permission/role-permission.module';

@Module({
  imports: [
    UserModule,
    DatabaseModule,
    RolePermissionModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: EnvironmentManager.get('JWT_SECRET', { errorOnMissing: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LoginAttemptService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
