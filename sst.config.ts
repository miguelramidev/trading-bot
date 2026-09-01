/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "crypto-signal-bot",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "ca-central-1", // Canadá (Para evitar bloqueos de IP de Binance.com a USA)
        },
      },
    };
  },
  async run() {
    // Shared environment variables for lambdas
    const envVars = {
      TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || "",
      DATABASE_URL: process.env.DATABASE_URL || "",
      BINANCE_API_KEY: process.env.BINANCE_API_KEY || "",
      BINANCE_API_SECRET: process.env.BINANCE_API_SECRET || "",
    };

    // 1. API Gateway para el Webhook de Telegram
    const api = new sst.aws.ApiGatewayV2("TelegramWebhook");
    
    api.route("POST /webhook", {
      handler: "src/telegram/webhook.handler",
      environment: envVars
    });

    // 2. Cron Jobs para el análisis del mercado
    // 15m (En el minuto 0, 15, 30, 45 de cada hora)
    new sst.aws.Cron("Cron15m", {
      schedule: "cron(0,15,30,45 * * * ? *)",
      job: {
        handler: "src/cron/analyze.handler15m",
        timeout: "120 seconds", // Le damos tiempo para descargar las 100 velas
        environment: envVars
      }
    });

    // 1h (En el minuto 0 de cada hora)
    new sst.aws.Cron("Cron1h", {
      schedule: "cron(0 * * * ? *)",
      job: {
        handler: "src/cron/analyze.handler1h",
        timeout: "120 seconds",
        environment: envVars
      }
    });

    // 4h (En la hora 0, 4, 8, 12, 16, 20)
    new sst.aws.Cron("Cron4h", {
      schedule: "cron(0 0,4,8,12,16,20 * * ? *)",
      job: {
        handler: "src/cron/analyze.handler4h",
        timeout: "120 seconds",
        environment: envVars
      }
    });

    // Monitor de posiciones (cada 5 minutos)
    new sst.aws.Cron("MonitorBreakeven", {
      schedule: "rate(5 minutes)",
      job: {
        handler: "src/cron/monitor.handler",
        timeout: "60 seconds",
        environment: envVars
      }
    });

    // Retorna la URL del API para configurar el webhook manualmente después
    return {
      WebhookUrl: api.url,
    };
  },
});
