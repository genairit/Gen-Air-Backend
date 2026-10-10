import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthGuard } from '@Guards/auth.guard';
import { AuthController } from './auth.controller';
import { UserModule } from '@Modules/user/user.module';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';

@Module({
  imports: [
    UserModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: EnvironmentManager.get('JWT_SECRET', { errorOnMissing: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
