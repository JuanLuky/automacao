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
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { StatusModule } from './status/status.module';
import { BusinessHoursModule } from './business-hours/business-hours.module';
import { ContactsModule } from './contacts/contacts.module';
import { User } from './users/entities/user.entity';
import { Department } from './departments/entities/department.entity';
import { Conversation } from './conversations/entities/conversation.entity';
import { Message } from './messages/entities/message.entity';
import { StatusUpdate } from './status/entities/status-update.entity';
import { BusinessHours } from './business-hours/entities/business-hours.entity';
import { Contact } from './contacts/entities/contact.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [User, Department, Conversation, Message, StatusUpdate, BusinessHours, Contact],
        // Schema controlado por migrations (npm run migration:run), não pelo runtime da app.
        // Ver src/database/migrations/ e src/database/data-source.ts.
        synchronize: false,
      }),
    }),
    AuthModule,
    UsersModule,
    DepartmentsModule,
    ConversationsModule,
    MessagesModule,
    WebsocketModule,
    EvolutionModule,
    WhatsappModule,
    StatusModule,
    BusinessHoursModule,
    ContactsModule,
  ],
})
export class AppModule {}
