import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './entities/message.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { User } from '../users/entities/user.entity';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessagesEvolutionController } from './messages-evolution.controller';
import { WebsocketModule } from '../websocket/websocket.module';
import { EvolutionModule } from '../integrations/evolution/evolution.module';
import { MediaStorageService } from './media-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Conversation, User]),
    WebsocketModule,
    EvolutionModule,
  ],
  controllers: [MessagesController, MessagesEvolutionController],
  providers: [MessagesService, MediaStorageService],
})
export class MessagesModule {}
