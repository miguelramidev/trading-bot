import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/mobile_dashboard.dart", "utf8");

content = content.replace(
    `Text('.50 USD', style: AppTheme.monoStyle.copyWith(fontSize: 14, color: AppColors.textSecondary, height: 2)),`,
    `Text('.\${(_balance.toStringAsFixed(2).split('.')[1])} USD', style: AppTheme.monoStyle.copyWith(fontSize: 14, color: AppColors.textSecondary, height: 2)),`
);

fs.writeFileSync("app/lib/screens/dashboard/mobile_dashboard.dart", content);
