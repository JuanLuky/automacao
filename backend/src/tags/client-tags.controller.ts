import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ClientTagsService } from './client-tags.service';
import { CreateClientTagDto } from './dto/create-client-tag.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Atribuir/remover etiqueta de um cliente é ação do dia a dia (priorizar
// atendimento), não governança de catálogo — por isso aberto a qualquer
// atendente autenticado, sem RolesGuard (diferente de TagsController, que
// controla o catálogo em si e é admin-only).
@UseGuards(JwtAuthGuard)
@Controller('client-tags')
export class ClientTagsController {
  constructor(private readonly clientTagsService: ClientTagsService) {}

  // ?telefones=555...,556... — busca em lote pra evitar N chamadas por
  // linha visível na fila.
  @Get()
  porTelefones(@Query('telefones') telefones?: string) {
    const lista = telefones
      ? telefones
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    return this.clientTagsService.porTelefones(lista);
  }

  @Post()
  attach(@Body() dto: CreateClientTagDto) {
    return this.clientTagsService.attach(dto);
  }

  @Delete(':telefone/:tagId')
  detach(@Param('telefone') telefone: string, @Param('tagId') tagId: string) {
    return this.clientTagsService.detach(telefone, tagId);
  }
}
