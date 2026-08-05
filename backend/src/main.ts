import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({ origin: '*' });

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
