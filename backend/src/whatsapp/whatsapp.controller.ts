import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { EvolutionService } from '../integrations/evolution/evolution.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly evolutionService: EvolutionService) {}

  @Get('status')
  status(@Query('instance') instance: string) {
    if (!instance) {
      throw new BadRequestException('Campo "instance" é obrigatório.');
    }
    return this.evolutionService.getConnectionState(instance);
  }

  @Get('qrcode')
  qrcode(@Query('instance') instance: string) {
    if (!instance) {
      throw new BadRequestException('Campo "instance" é obrigatório.');
    }
    return this.evolutionService.getQrCode(instance);
  }
}
