import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AutoMessagesService } from './auto-messages.service';
import { UpdateAutoMessagesDto } from './dto/update-auto-messages.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('auto-messages')
export class AutoMessagesController {
  constructor(private readonly autoMessagesService: AutoMessagesService) {}

  // Qualquer atendente autenticado precisa ler (disparada ao Assumir/
  // Finalizar por qualquer atendente, não só admin) — só a edição é
  // admin-only, mesmo padrão de RoleLabelsController.
  @UseGuards(JwtAuthGuard)
  @Get()
  obter() {
    return this.autoMessagesService.obter();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch()
  atualizar(@Body() dto: UpdateAutoMessagesDto) {
    return this.autoMessagesService.atualizar(dto);
  }
}
