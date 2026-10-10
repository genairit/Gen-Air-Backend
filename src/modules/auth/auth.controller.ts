import { ApiTags } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { Public } from '@Decorators/public.decorator';
import { ILoginResponse } from './interfaces/auth.interface';
import { Body, Post, HttpCode, HttpStatus, Controller } from '@nestjs/common';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() credentials: LoginDto): Promise<ILoginResponse> {
    return this.authService.login(credentials);
  }
}
