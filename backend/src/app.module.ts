import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DepartmentsModule } from './departments/departments.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { WebsocketModule } from './websocket/websocket.module';
import { EvolutionModule } from './integrations/evolution/evolution.module';
import { User } from './users/entities/user.entity';
import { Department } from './departments/entities/department.entity';
import { Conversation } from './conversations/entities/conversation.entity';
import { Message } from './messages/entities/message.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [User, Department, Conversation, Message],
        // Só em desenvolvimento. Em produção, use migrations (npm run migration:run).
        synchronize: configService.get<string>('TYPEORM_SYNCHRONIZE') === 'true',
      }),
    }),
    AuthModule,
    UsersModule,
    DepartmentsModule,
    ConversationsModule,
    MessagesModule,
    WebsocketModule,
    EvolutionModule,
  ],
})
export class AppModule {}
