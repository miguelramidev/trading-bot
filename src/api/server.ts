import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { signalsRouter } from "./modules/signals/infrastructure/SignalController.js";
import { usersRouter } from "./modules/users/infrastructure/UserController.js";
import { dashboardRouter } from "./modules/dashboard/infrastructure/DashboardController.js";

const app = new Hono();

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

// Health check
app.get("/", (c) => c.json({ status: "ok", service: "Trading Bot API" }));

// Modules
app.route("/api/signals", signalsRouter);
app.route("/api/users", usersRouter);
app.route("/api/dashboard", dashboardRouter);

// Handler for AWS Lambda (ApiGatewayV2)
export const handler = handle(app);
