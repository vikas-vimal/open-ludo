import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { getEnv } from './common/env.js';
import { AppExceptionFilter } from './common/http-exception.filter.js';

async function bootstrap(): Promise<void> {
  const env = getEnv();
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: env.WEB_ORIGIN,
      credentials: true,
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: true,
    }),
  );

  app.useGlobalFilters(new AppExceptionFilter());

  await app.listen(env.PORT);
}

bootstrap();
