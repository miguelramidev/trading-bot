import fs from "fs";

let content = fs.readFileSync("src/api/modules/dashboard/infrastructure/DashboardController.ts", "utf8");

// Add dailyReports to imports
content = content.replace(
    `import { signalHistory } from "../../../../db/schema.js";`,
    `import { signalHistory, dailyReports } from "../../../../db/schema.js";`
);

// Fetch up to 30 snapshots
const fetchChart = `    // Fetch recent signals
    const signals = await db.query.signalHistory.findMany({
      limit: 5,
      orderBy: [desc(signalHistory.evaluatedAt)]
    });
    
    // Fetch up to 30 days of performance chart data
    const snapshots = await db.query.dailyReports.findMany({
      where: eq(dailyReports.firebaseUid, firebaseUid),
      orderBy: [desc(dailyReports.reportDate)],
      limit: 30
    });
    
    // If no snapshots exist yet, initialize with current balance
    const chartData = snapshots.length > 0 ? snapshots.reverse().map(s => ({
      date: s.reportDate.toISOString(),
      balance: parseFloat(s.balance)
    })) : [{ date: new Date().toISOString(), balance: totalBalance }];`;

content = content.replace(
    `    // Fetch recent signals
    const signals = await db.query.signalHistory.findMany({
      limit: 5,
      orderBy: [desc(signalHistory.evaluatedAt)]
    });`,
    fetchChart
);

// Add to response
content = content.replace(
    `      signals: signals.map(s => ({
        symbol: s.symbol,
        direction: s.direction,
        evaluatedAt: s.evaluatedAt,
      })),`,
    `      signals: signals.map(s => ({
        symbol: s.symbol,
        direction: s.direction,
        evaluatedAt: s.evaluatedAt,
      })),
      chartData,`
);

content = content.replace(
    `signals: [] }`,
    `signals: [], chartData: [] }`
);

fs.writeFileSync("src/api/modules/dashboard/infrastructure/DashboardController.ts", content);
