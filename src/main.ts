import morgan from 'morgan';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { GeneralFilter } from './filters/http-error.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const bootstrap = async () => {
  const app = await NestFactory.create(AppModule);
  app.use(morgan('combined'));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GenAir CRM API')
    .setDescription('API for the GenAir HVAC projects CRM')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, swaggerDocument);

  app.useGlobalFilters(new GeneralFilter(app.get(HttpAdapterHost)));
  await app.listen(process.env.PORT ?? 3000);
};

void bootstrap();
