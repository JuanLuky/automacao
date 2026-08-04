import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatusUpdate } from './entities/status-update.entity';
import { StatusService } from './status.service';
import { StatusController } from './status.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StatusUpdate])],
  controllers: [StatusController],
  providers: [StatusService],
})
export class StatusModule {}
