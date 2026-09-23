import fs from "fs";

let content = fs.readFileSync("src/api/server.ts", "utf8");

content = content.replace(
    `import { usersRouter } from "./modules/users/infrastructure/UserController.js";`,
    `import { usersRouter } from "./modules/users/infrastructure/UserController.js";\nimport { dashboardRouter } from "./modules/dashboard/infrastructure/DashboardController.js";`
);

content = content.replace(
    `app.route("/api/users", usersRouter);`,
    `app.route("/api/users", usersRouter);\napp.route("/api/dashboard", dashboardRouter);`
);

fs.writeFileSync("src/api/server.ts", content);
