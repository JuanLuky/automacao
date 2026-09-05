import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Origens permitidas do painel (frontend) — CORS_ORIGIN aceita uma ou
  // várias, separadas por vírgula. Sem essa env, cai no dev local padrão
  // (frontend em :3001) em vez de abrir pra qualquer origem.
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : 'http://localhost:3001',
  });

  // Padrão do Express é 100kb — pequeno demais pra mensagens com mídia em
  // base64 (imagem/documento até 15MB decodificado, ver MediaStorageService,
  // +~33% do encoding). 20mb dá margem confortável sem abrir demais.
  app.useBodyParser('json', { limit: '20mb' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Backend rodando em http://localhost:${port}`);
}

bootstrap();
