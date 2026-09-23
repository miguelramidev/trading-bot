import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/mobile_settings.dart", "utf8");

content = content.replace(
    /style: ToastificationStyle\.flatColored,\s*title: const Text\('Llaves Generadas Exitosamente'\),\s*description: const Text\('Copia la llave pública a Binance\. La privada se ha guardado encriptada\.'\),\s*alignment: Alignment\.topCenter,\s*autoCloseDuration: const Duration\(seconds: 4\),\s*backgroundColor: AppColors\.winGreen\.withOpacity\(0\.1\),\s*foregroundColor: AppColors\.winGreen,\s*icon: const Icon\(Icons\.check_circle, color: AppColors\.winGreen\),/g,
    `style: ToastificationStyle.fillColored,
          title: const Text('Llaves Generadas', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          description: const Text('La llave privada se guardó encriptada. Recuerda guardar los parámetros.', style: TextStyle(color: Colors.white70)),
          alignment: Alignment.topCenter,
          autoCloseDuration: const Duration(seconds: 4),
          backgroundColor: AppColors.surface,
          primaryColor: AppColors.winGreen,
          icon: const Icon(Icons.check_circle, color: AppColors.winGreen),
          showProgressBar: false,`
);

fs.writeFileSync("app/lib/screens/dashboard/mobile_settings.dart", content);
