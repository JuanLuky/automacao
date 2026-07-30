import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { EvolutionModule } from '../integrations/evolution/evolution.module';

@Module({
  imports: [EvolutionModule],
  controllers: [WhatsappController],
})
export class WhatsappModule {}
