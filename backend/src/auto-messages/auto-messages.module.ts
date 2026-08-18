import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoMessages } from './entities/auto-messages.entity';
import { AutoMessagesService } from './auto-messages.service';
import { AutoMessagesController } from './auto-messages.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AutoMessages])],
  controllers: [AutoMessagesController],
  providers: [AutoMessagesService],
})
export class AutoMessagesModule {}
