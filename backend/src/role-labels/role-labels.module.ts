import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleLabels } from './entities/role-labels.entity';
import { RoleLabelsService } from './role-labels.service';
import { RoleLabelsController } from './role-labels.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RoleLabels])],
  controllers: [RoleLabelsController],
  providers: [RoleLabelsService],
})
export class RoleLabelsModule {}
