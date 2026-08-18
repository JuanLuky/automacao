import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoMessages } from './entities/auto-messages.entity';
import { UpdateAutoMessagesDto } from './dto/update-auto-messages.dto';

// Default em memória, usado só se a tabela estiver vazia (seed não rodou
// ainda) — mesmo padrão de BUSINESS_HOURS_PADRAO/ROLE_LABELS_PADRAO. Textos
// idênticos aos que eram hardcoded em frontend/src/lib/quickReplies.ts antes
// desta feature. "[nome do atendente]" é resolvido no frontend
// (resolverTemplate), igual já acontecia.
export const AUTO_MESSAGES_PADRAO = {
  mensagem_iniciar:
    'Olá! Tudo bem? Meu nome é [nome do atendente], vou te ajudar por aqui.',
  mensagem_finalizar: 'Fico à disposição! Tenha um ótimo dia.',
};

type AutoMessagesConfig = Pick<
  AutoMessages,
  'mensagem_iniciar' | 'mensagem_finalizar'
>;

@Injectable()
export class AutoMessagesService {
  constructor(
    @InjectRepository(AutoMessages)
    private readonly autoMessagesRepository: Repository<AutoMessages>,
  ) {}

  async obter(): Promise<AutoMessages | AutoMessagesConfig> {
    const [config] = await this.autoMessagesRepository.find({ take: 1 });
    return config ?? AUTO_MESSAGES_PADRAO;
  }

  async atualizar(dto: UpdateAutoMessagesDto): Promise<AutoMessages> {
    let [config] = await this.autoMessagesRepository.find({ take: 1 });
    if (!config) {
      config = this.autoMessagesRepository.create(AUTO_MESSAGES_PADRAO);
    }
    Object.assign(config, dto);
    return this.autoMessagesRepository.save(config);
  }
}
