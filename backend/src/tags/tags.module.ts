import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tag } from './entities/tag.entity';
import { ClientTag } from './entities/client-tag.entity';
import { TagsService } from './tags.service';
import { TagsController } from './tags.controller';
import { ClientTagsService } from './client-tags.service';
import { ClientTagsController } from './client-tags.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tag, ClientTag])],
  controllers: [TagsController, ClientTagsController],
  providers: [TagsService, ClientTagsService],
})
export class TagsModule {}
