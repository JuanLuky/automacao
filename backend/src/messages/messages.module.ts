import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './entities/message.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { WebsocketModule } from '../websocket/websocket.module';
import { EvolutionModule } from '../integrations/evolution/evolution.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Conversation]),
    WebsocketModule,
    EvolutionModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
