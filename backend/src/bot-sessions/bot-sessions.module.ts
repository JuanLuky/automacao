import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotSession } from './entities/bot-session.entity';
import { BotSessionsService } from './bot-sessions.service';
import { BotSessionsController } from './bot-sessions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BotSession])],
  controllers: [BotSessionsController],
  providers: [BotSessionsService],
  // Exportado porque ConversationsService registra/encerra sessão de bot
  // no mesmo ponto em que resolve o atendimento ativo de um telefone.
  exports: [BotSessionsService],
})
export class BotSessionsModule {}
