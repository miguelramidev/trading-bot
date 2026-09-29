import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { HTTPException } from "hono/http-exception";
import { signalsRouter } from "./modules/signals/infrastructure/SignalController.js";
import { usersRouter } from "./modules/users/infrastructure/UserController.js";
import { dashboardRouter } from "./modules/dashboard/infrastructure/DashboardController.js";
import { marketRouter } from "./modules/market/infrastructure/MarketController.js";
import { historyRouter } from "./modules/history/infrastructure/HistoryController.js";
import { authMiddleware } from "./core/middleware/firebaseAuth.js";
import { internalError } from "./core/utils/errors.js";
import type { AuthEnv } from "./core/middleware/auth.js";

const app = new Hono<AuthEnv>();

// Global Middlewares
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204 as any);
  }
  await next();
});

// Health check (única ruta pública: no devuelve datos)
app.get("/", (c) => c.json({ status: "ok", service: "Trading Bot API" }));

// Todo /api/* exige un ID token de Firebase verificado y un uid en la lista de permitidos.
// Va después del CORS: el preflight OPTIONS ya se resolvió arriba y los 401/403 llevan cabeceras CORS.
app.use("/api/*", authMiddleware);

// Modules
app.route("/api/signals", signalsRouter);
app.route("/api/users", usersRouter);
app.route("/api/dashboard", dashboardRouter);
app.route("/api/market", marketRouter);
app.route("/api/history", historyRouter);

// Red de seguridad: cualquier error no capturado sale como 500 genérico con id; el detalle queda en el log.
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  return internalError(c, err, `${c.req.method} ${c.req.path}`);
});

// Handler for AWS Lambda (ApiGatewayV2)
export const handler = handle(app);
