import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { RoleLabelsService } from './role-labels.service';
import { UpdateRoleLabelsDto } from './dto/update-role-labels.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('role-labels')
export class RoleLabelsController {
  constructor(private readonly roleLabelsService: RoleLabelsService) {}

  // Qualquer atendente autenticado precisa ler (o rótulo aparece no header
  // e na tela de usuários pra todo mundo, não só admin) — só a edição é
  // admin-only, ver PATCH abaixo.
  @UseGuards(JwtAuthGuard)
  @Get()
  obter() {
    return this.roleLabelsService.obter();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch()
  atualizar(@Body() dto: UpdateRoleLabelsDto) {
    return this.roleLabelsService.atualizar(dto);
  }
}
