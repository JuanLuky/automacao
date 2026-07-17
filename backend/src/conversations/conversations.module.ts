import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from '../messages/entities/message.entity';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message]),
    WebsocketModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
