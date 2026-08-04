import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { StatusService } from './status.service';
import { CreateStatusUpdateDto } from './dto/create-status-update.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('status')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  // Público de propósito: é a página /status que o cliente acessa sem login.
  @Get('atual')
  atual() {
    return this.statusService.atual();
  }

  @Get('historico')
  historico(@Query('limite') limite?: string) {
    return this.statusService.historico(limite ? Number(limite) : undefined);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  criar(@Body() dto: CreateStatusUpdateDto) {
    return this.statusService.criar(dto);
  }
}
