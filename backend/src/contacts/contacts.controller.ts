import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ImportContactsDto } from './dto/import-contacts.dto';
import { EvolutionService } from '../integrations/evolution/evolution.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Aberto a todos os atendentes autenticados (não admin-only) — pedido
// explícito do usuário ("aba que apareça para todos usuários"), mesmo
// padrão já usado em /grupos (ver "Contatos" no CLAUDE.md).
@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly evolutionService: EvolutionService,
  ) {}

  // Passthrough do payload cru da Evolution API (findContacts) — o formato
  // varia entre versões, quem normaliza é o frontend (mesmo padrão de
  // /whatsapp/status e /whatsapp/qrcode). Nunca persistido no nosso banco:
  // busca ao vivo a cada chamada, ver "Contatos" no CLAUDE.md.
  @Get('whatsapp')
  whatsapp(@Query('instance') instance: string) {
    if (!instance) {
      throw new BadRequestException('Campo "instance" é obrigatório.');
    }
    return this.evolutionService.getContacts(instance);
  }

  @Get()
  findAll() {
    return this.contactsService.findAll();
  }

  @Post()
  create(@Body() dto: CreateContactDto) {
    return this.contactsService.create(dto);
  }

  @Post('import')
  import(@Body() dto: ImportContactsDto) {
    return this.contactsService.import(dto.contatos);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contactsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contactsService.remove(id);
  }
}
