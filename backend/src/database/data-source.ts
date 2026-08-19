import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from '../users/entities/user.entity';
import { Department } from '../departments/entities/department.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { Message } from '../messages/entities/message.entity';
import { StatusUpdate } from '../status/entities/status-update.entity';
import { BusinessHours } from '../business-hours/entities/business-hours.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { RoleLabels } from '../role-labels/entities/role-labels.entity';
import { AutoMessages } from '../auto-messages/entities/auto-messages.entity';
import { QuickReply } from '../quick-replies/entities/quick-reply.entity';
import { Tag } from '../tags/entities/tag.entity';
import { ClientTag } from '../tags/entities/client-tag.entity';
import { BotSession } from '../bot-sessions/entities/bot-session.entity';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  // Precisa listar toda entidade usada por src/database/seed.ts (CLI de
  // migration não depende disso, mas o seed sim — descoberto em 2026-08-18
  // quando RoleLabels/Contact estavam faltando aqui e o seed quebrava antes
  // de chegar nas entidades novas).
  entities: [
    User,
    Department,
    Conversation,
    Message,
    StatusUpdate,
    BusinessHours,
    Contact,
    RoleLabels,
    AutoMessages,
    QuickReply,
    Tag,
    ClientTag,
    BotSession,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false, // migrations controlam o schema fora do runtime da app
});
