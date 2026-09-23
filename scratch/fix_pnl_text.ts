import fs from "fs";

function fixFile(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");
    
    // Desktop
    content = content.replace(
        `Text('+\$45,210.80 (+3.77%) PnL ACTIVO', style: AppTheme.monoStyle.copyWith(color: _unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed, fontSize: 12, fontWeight: FontWeight.bold))`,
        `Text('\${_unrealizedPnl >= 0 ? '+' : ''}\$\${_unrealizedPnl.toStringAsFixed(2)} (\${_pnlPercent >= 0 ? '+' : ''}\${_pnlPercent.toStringAsFixed(2)}%) PnL ACTIVO', style: AppTheme.monoStyle.copyWith(color: _unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed, fontSize: 12, fontWeight: FontWeight.bold))`
    );

    // Mobile
    content = content.replace(
        `Text('+\$45,210.80 (+3.77%) PnL ACTIVO', style: AppTheme.monoStyle.copyWith(color: _unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed, fontSize: 10, fontWeight: FontWeight.bold))`,
        `Text('\${_unrealizedPnl >= 0 ? '+' : ''}\$\${_unrealizedPnl.toStringAsFixed(2)} (\${_pnlPercent >= 0 ? '+' : ''}\${_pnlPercent.toStringAsFixed(2)}%) PnL ACTIVO', style: AppTheme.monoStyle.copyWith(color: _unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed, fontSize: 10, fontWeight: FontWeight.bold))`
    );

    fs.writeFileSync(filePath, content);
}

fixFile("app/lib/screens/dashboard/desktop_dashboard.dart");
fixFile("app/lib/screens/dashboard/mobile_dashboard.dart");
