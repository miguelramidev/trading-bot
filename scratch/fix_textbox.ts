import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/desktop_settings.dart", "utf8");

content = content.replace(
    "Expanded(child: Text('-----BEGIN PUBLIC KEY-----\\nMIIBIjANBgkqhkiG... (Generar primero)\\n-----END PUBLIC KEY-----', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)))",
    "Expanded(child: SelectableText(_rsaPublicKey ?? 'Presiona el botón para generar...', style: AppTheme.monoStyle.copyWith(color: _rsaPublicKey != null ? AppColors.textPrimary : AppColors.textSecondary, fontSize: 10)))"
);

fs.writeFileSync("app/lib/screens/dashboard/desktop_settings.dart", content);
