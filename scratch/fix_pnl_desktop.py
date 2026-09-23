def fix():
    with open("app/lib/screens/dashboard/desktop_dashboard.dart", "r") as f:
        content = f.read()

    # Exact string replacement
    target = "Text('+\\$45,210.80 (+3.77%) PnL ACTIVO', style: AppTheme.monoStyle.copyWith(color: _unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed, fontSize: 12, fontWeight: FontWeight.bold))"
    replacement = "Text('${_unrealizedPnl >= 0 ? '+' : ''}\\$${_unrealizedPnl.toStringAsFixed(2)} (${_pnlPercent >= 0 ? '+' : ''}${_pnlPercent.toStringAsFixed(2)}%) PnL ACTIVO', style: AppTheme.monoStyle.copyWith(color: _unrealizedPnl >= 0 ? AppColors.winGreen : AppColors.lossRed, fontSize: 12, fontWeight: FontWeight.bold))"
    
    content = content.replace(target, replacement)

    with open("app/lib/screens/dashboard/desktop_dashboard.dart", "w") as f:
        f.write(content)

fix()
