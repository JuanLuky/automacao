import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotSession } from './entities/bot-session.entity';
import { BotSessionsService } from './bot-sessions.service';
import { BotSessionsController } from './bot-sessions.controller';
import { WebsocketModule } from '../websocket/websocket.module';
import { MediaStorageService } from '../messages/media-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([BotSession]), WebsocketModule],
  controllers: [BotSessionsController],
  // MediaStorageService também é provider de MessagesModule — é uma classe
  // sem estado (só lê/escreve em disco), então declarar aqui de novo evita
  // importar MessagesModule inteiro só por causa disso (e um ciclo de
  // módulos: MessagesModule não depende de BotSessionsModule).
  providers: [BotSessionsService, MediaStorageService],
  // Exportado porque ConversationsService registra/encerra sessão de bot
  // no mesmo ponto em que resolve o atendimento ativo de um telefone.
  exports: [BotSessionsService],
})
export class BotSessionsModule {}
