import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { BusinessHoursService } from './business-hours.service';
import { UpdateBusinessHoursDto } from './dto/update-business-hours.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('business-hours')
export class BusinessHoursController {
  constructor(private readonly businessHoursService: BusinessHoursService) {}

  // Público de propósito: o n8n consulta sem autenticação, mesmo padrão de GET /departments.
  @Get()
  getPublico() {
    return this.businessHoursService.getPublico();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch()
  async atualizar(@Body() dto: UpdateBusinessHoursDto) {
    const config = await this.businessHoursService.atualizar(dto);
    return { ...config, aberto: this.businessHoursService.estaAberto(config) };
  }
}
