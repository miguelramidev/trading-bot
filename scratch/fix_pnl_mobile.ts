import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/mobile_dashboard.dart", "utf8");

content = content.replace(
    `Text('+\\$45.20 (+0.3%)', style: AppTheme.monoStyle.copyWith(color: _unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed, fontSize: 12, fontWeight: FontWeight.bold))`,
    `Text('\${_unrealizedPnl >= 0 ? '+' : ''}\$\${_unrealizedPnl.toStringAsFixed(2)} (\${_pnlPercent >= 0 ? '+' : ''}\${_pnlPercent.toStringAsFixed(2)}%)', style: AppTheme.monoStyle.copyWith(color: _unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed, fontSize: 12, fontWeight: FontWeight.bold))`
);

fs.writeFileSync("app/lib/screens/dashboard/mobile_dashboard.dart", content);
