import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/desktop_dashboard.dart", "utf8");

content = content.replace(
    /Text\(pnl, style: AppTheme\.monoStyle\.copyWith\(color: AppColors\.winGreen, fontWeight: FontWeight\.bold, fontSize: 16\)\),/,
    `Text(pnl, style: AppTheme.monoStyle.copyWith(color: pnl.startsWith('-') ? AppColors.lossRed : AppColors.winGreen, fontWeight: FontWeight.bold, fontSize: 16)),`
);

content = content.replace(
    /Text\(pnlPct, style: AppTheme\.monoStyle\.copyWith\(color: AppColors\.winGreen, fontSize: 12\)\),/,
    `Text(pnlPct, style: AppTheme.monoStyle.copyWith(color: pnlPct.startsWith('-') ? AppColors.lossRed : AppColors.winGreen, fontSize: 12)),`
);

fs.writeFileSync("app/lib/screens/dashboard/desktop_dashboard.dart", content);
