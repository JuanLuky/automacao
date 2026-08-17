import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from './entities/contact.entity';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { EvolutionModule } from '../integrations/evolution/evolution.module';

@Module({
  imports: [TypeOrmModule.forFeature([Contact]), EvolutionModule],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
