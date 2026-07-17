import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from '../users/entities/user.entity';
import { Department } from '../departments/entities/department.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { Message } from '../messages/entities/message.entity';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Department, Conversation, Message],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false, // migrations controlam o schema fora do runtime da app
});
