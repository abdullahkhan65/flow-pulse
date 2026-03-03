import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });

  const configService = app.get(ConfigService);

  // Security
  app.use(helmet());
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  app.enableCors({
    origin: (origin, callback) => {
      if (
        !origin ||
        origin === frontendUrl ||
        origin === "http://localhost:3000" ||
        origin === "http://localhost:3001" ||
        /\.vercel\.app$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });

  // Global validation pipe — strips unknown fields, validates DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());

  // API prefix
  app.setGlobalPrefix("api/v1");

  // Swagger docs (disable in production)
  if (configService.get("NODE_ENV") !== "production") {
    const config = new DocumentBuilder()
      .setTitle("FlowPulse API")
      .setDescription("Privacy-first team productivity analytics API")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = configService.get<number>("PORT", 3001);
  await app.listen(port);
  console.log(`FlowPulse backend running on http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
