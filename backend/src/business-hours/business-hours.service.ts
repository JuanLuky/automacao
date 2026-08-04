import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessHours } from './entities/business-hours.entity';
import { UpdateBusinessHoursDto } from './dto/update-business-hours.dto';

// Default em memória, usado só se a tabela estiver vazia (seed não rodou ainda).
export const BUSINESS_HOURS_PADRAO = {
  dias_funcionamento: [1, 2, 3, 4, 5],
  hora_inicio: '08:00',
  hora_fim: '18:00',
  mensagem_fora_horario:
    'Estamos fora do horário de atendimento agora. Nosso horário é de segunda a sexta, das 8h às 18h. Retornaremos sua mensagem assim que possível!',
};

type BusinessHoursConfig = Pick<
  BusinessHours,
  'dias_funcionamento' | 'hora_inicio' | 'hora_fim' | 'mensagem_fora_horario'
>;

@Injectable()
export class BusinessHoursService {
  constructor(
    @InjectRepository(BusinessHours)
    private readonly businessHoursRepository: Repository<BusinessHours>,
  ) {}

  private async getConfig(): Promise<BusinessHours | BusinessHoursConfig> {
    const [config] = await this.businessHoursRepository.find({ take: 1 });
    return config ?? BUSINESS_HOURS_PADRAO;
  }

  // Servidor roda nativamente em America/Sao_Paulo (mesmo fuso das colunas
  // timestamptz, ver CLAUDE.md) — new Date() aqui já é hora local, sem
  // conversão de fuso necessária.
  estaAberto(config: BusinessHoursConfig, agora = new Date()): boolean {
    if (!config.dias_funcionamento.includes(agora.getDay())) return false;

    const horaAtual = `${String(agora.getHours()).padStart(2, '0')}:${String(
      agora.getMinutes(),
    ).padStart(2, '0')}`;
    return horaAtual >= config.hora_inicio && horaAtual <= config.hora_fim;
  }

  async getPublico() {
    const config = await this.getConfig();
    return { ...config, aberto: this.estaAberto(config) };
  }

  async atualizar(dto: UpdateBusinessHoursDto): Promise<BusinessHours> {
    let [config] = await this.businessHoursRepository.find({ take: 1 });
    if (!config) {
      config = this.businessHoursRepository.create(BUSINESS_HOURS_PADRAO);
    }
    Object.assign(config, dto);
    return this.businessHoursRepository.save(config);
  }
}
