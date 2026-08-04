import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessHours } from './entities/business-hours.entity';
import { BusinessHoursService } from './business-hours.service';
import { BusinessHoursController } from './business-hours.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessHours])],
  controllers: [BusinessHoursController],
  providers: [BusinessHoursService],
})
export class BusinessHoursModule {}
