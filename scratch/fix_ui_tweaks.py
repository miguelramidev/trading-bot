import re

def fix(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Fix title
    content = content.replace(
        "Text('MacroQuant Executive', style: Theme.of(context).textTheme.displaySmall?.copyWith(fontSize: 18))",
        "Text('MacroQuant Ejecutivo', style: const TextStyle(color: AppColors.textPrimary, fontSize: 18, fontWeight: FontWeight.bold))"
    )

    # Fix sync button color
    content = content.replace(
        "const Icon(Icons.sync, color: AppColors.textSecondary, size: 14)",
        "const Icon(Icons.sync, color: AppColors.winGreen, size: 14)"
    )
    content = content.replace(
        "Text('Sincronizar', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 12))",
        "Text('Sincronizar', style: AppTheme.monoStyle.copyWith(color: AppColors.winGreen, fontSize: 12))"
    )

    with open(file_path, 'w') as f:
        f.write(content)

fix('app/lib/screens/dashboard/desktop_dashboard.dart')
fix('app/lib/screens/dashboard/mobile_dashboard.dart')
