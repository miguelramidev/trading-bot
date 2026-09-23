import fs from "fs";

function fix(file: string) {
    let content = fs.readFileSync(file, "utf8");
    content = content.replace(/pnl\.startsWith\('-'\)/g, "pnl.contains('-')");
    content = content.replace(/pnlPct\.startsWith\('-'\)/g, "pnlPct.contains('-')");
    fs.writeFileSync(file, content);
}

fix("app/lib/screens/dashboard/desktop_dashboard.dart");
fix("app/lib/screens/dashboard/mobile_dashboard.dart");
