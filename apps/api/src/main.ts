import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Cloud Run injects env vars directly — only load .env for local development.
const envPath = resolve(__dirname, '../../../.env');
if (process.env.NODE_ENV !== 'production' && existsSync(envPath)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: envPath });
}

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { API_CONFIG } from '@cmp/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      // Public CMP assets (sdk.js) are embedded on customer websites.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const portalOrigins = new Set(
    [process.env.ADMIN_URL ?? 'http://localhost:3001', process.env.WEB_URL ?? 'http://localhost:3000'].map(
      (url) => url.replace(/\/$/, ''),
    ),
  );

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalized = origin.replace(/\/$/, '');
      if (portalOrigins.has(normalized)) {
        callback(null, true);
        return;
      }
      // CMP SDK runs on customer websites — allow HTTPS (and localhost for dev).
      if (
        origin.startsWith('https://') ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1')
      ) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });
  app.setGlobalPrefix(API_CONFIG.prefix);

  const swagger = new DocumentBuilder()
    .setTitle('Consent Management Platform API')
    .setDescription('Admin JWT API and Developer API key endpoints under /developer/v1')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'Authorization', in: 'header' }, 'api-key')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT ?? API_CONFIG.port);
  await app.listen(port, '0.0.0.0');
  console.log(`API listening on http://0.0.0.0:${port}/${API_CONFIG.prefix}`);
}

bootstrap().catch((error) => {
  console.error('[cmp-api] Fatal startup error:', error);
  process.exit(1);
});
