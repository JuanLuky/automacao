import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  // Lista pública propositalmente: o n8n também pode precisar consultar
  // os setores disponíveis sem autenticação de atendente.
  @Get()
  findAll() {
    return this.departmentsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() body: { nome: string; codigo: string }) {
    return this.departmentsService.create(body.nome, body.codigo);
  }
}
