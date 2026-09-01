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
    // 1. Secretos Nativos de SST (Sustituyen al .env en Producción)
    const TELEGRAM_TOKEN = new sst.Secret("TELEGRAM_TOKEN");
    const DATABASE_URL = new sst.Secret("DATABASE_URL");
    const BINANCE_API_KEY = new sst.Secret("BINANCE_API_KEY");
    const BINANCE_API_SECRET = new sst.Secret("BINANCE_API_SECRET");
    const ALL_SECRETS = [TELEGRAM_TOKEN, DATABASE_URL, BINANCE_API_KEY, BINANCE_API_SECRET];

    // 1. API Gateway para el Webhook de Telegram
    const api = new sst.aws.ApiGatewayV2("TelegramWebhook");
    
    api.route("POST /webhook", {
      handler: "src/telegram/webhook.handler",
      link: ALL_SECRETS
    });

    // 2. Cron Jobs para el análisis del mercado
    // 15m (En el minuto 0, 15, 30, 45 de cada hora)
    new sst.aws.Cron("Cron15m", {
      schedule: "cron(0,15,30,45 * * * ? *)",
      job: {
        handler: "src/cron/analyze.handler15m",
        timeout: "120 seconds", // Le damos tiempo para descargar las 100 velas
        link: ALL_SECRETS
      }
    });

    // 1h (En el minuto 0 de cada hora)
    new sst.aws.Cron("Cron1h", {
      schedule: "cron(0 * * * ? *)",
      job: {
        handler: "src/cron/analyze.handler1h",
        timeout: "120 seconds",
        link: ALL_SECRETS
      }
    });

    // 4h (En la hora 0, 4, 8, 12, 16, 20)
    new sst.aws.Cron("Cron4h", {
      schedule: "cron(0 0,4,8,12,16,20 * * ? *)",
      job: {
        handler: "src/cron/analyze.handler4h",
        timeout: "120 seconds",
        link: ALL_SECRETS
      }
    });

    // Reporte Diario de PnL (A las 23:00 PYT -> 03:00 UTC)
    new sst.aws.Cron("DailyReport", {
      schedule: "cron(0 3 * * ? *)",
      job: {
        handler: "src/cron/report.handler",
        timeout: "60 seconds",
        link: ALL_SECRETS
      }
    });

    // Retorna la URL del API para configurar el webhook manualmente después
    return {
      WebhookUrl: api.url,
    };
  },
});
