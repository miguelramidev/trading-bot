import fs from "fs";

let content = fs.readFileSync("src/api/modules/dashboard/infrastructure/DashboardController.ts", "utf8");

// Add imports
content = content.replace(
    `import { eq } from "drizzle-orm";`,
    `import { eq, desc } from "drizzle-orm";\nimport { signalHistory } from "../../../../db/schema.js";`
);

// Add default fields for error
content = content.replace(
    /positions: \[\]\s*\}/g,
    `positions: [], freeBalance: 0, usedBalance: 0, signals: [] }`
);

// Add balance calculations and signals fetch
content = content.replace(
    /const pnlPercent = totalBalance > 0 \? \(unrealizedPnl \/ \(totalBalance - unrealizedPnl\)\) \* 100 : 0;/g,
    `const pnlPercent = totalBalance > 0 ? (unrealizedPnl / (totalBalance - unrealizedPnl)) * 100 : 0;
    
    const freeBalance = (balance.free as any)['USDT'] || 0;
    const usedBalance = (balance.used as any)['USDT'] || 0;
    
    // Fetch recent signals
    const signals = await db.query.signalHistory.findMany({
      limit: 5,
      orderBy: [desc(signalHistory.evaluatedAt)]
    });`
);

// Add to success response
content = content.replace(
    /userName: user\.name \|\| "Usuario",/g,
    `userName: user.name || "Usuario",
      freeBalance,
      usedBalance,
      signals: signals.map(s => ({
        symbol: s.symbol,
        direction: s.direction,
        evaluatedAt: s.evaluatedAt,
      })),`
);

fs.writeFileSync("src/api/modules/dashboard/infrastructure/DashboardController.ts", content);
