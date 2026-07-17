import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string; senha: string }) {
    return this.authService.login(body.email, body.senha);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me')
  me(@Req() req: any) {
    return req.user;
  }
}
