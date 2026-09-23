import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/mobile_settings.dart", "utf8");

content = content.replace(
    "label: const Text('Generar Llave Pública', style: TextStyle(color: AppColors.winGreen))",
    "label: _isLoading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.winGreen)) : const Text('Generar Llave Pública', style: TextStyle(color: AppColors.winGreen))"
);

fs.writeFileSync("app/lib/screens/dashboard/mobile_settings.dart", content);
