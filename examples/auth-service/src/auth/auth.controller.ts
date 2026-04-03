import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Headers,
  UnauthorizedException,
  HttpCode,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Get('validate')
  validate(@Headers('authorization') authorization: string) {
    const token = authorization?.replace('Bearer ', '').trim();
    if (!token) throw new UnauthorizedException('No token provided');
    return this.auth.validate(token);
  }

  @Delete('logout')
  @HttpCode(204)
  logout(@Headers('authorization') authorization: string) {
    const token = authorization?.replace('Bearer ', '').trim();
    if (token) this.auth.logout(token);
  }
}
