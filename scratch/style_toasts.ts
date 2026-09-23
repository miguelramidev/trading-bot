import fs from "fs";

function styleToasts(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");

    // Success toasts
    content = content.replace(
        /style: ToastificationStyle\.flatColored,\s*title: const Text\('Llaves Generadas Exitosamente'\),\s*description: const Text\('Copia la llave pública a Binance\. La privada se ha guardado encriptada\.'\),\s*alignment: Alignment\.(topRight|topCenter),\s*autoCloseDuration: const Duration\(seconds: 4\),\s*backgroundColor: AppColors\.winGreen\.withValues\(alpha: 0\.1\),\s*foregroundColor: AppColors\.winGreen,\s*icon: const Icon\(Icons\.check_circle, color: AppColors\.winGreen\),/g,
        `style: ToastificationStyle.fillColored,
          title: const Text('Llaves Generadas', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          description: const Text('La llave privada se guardó encriptada. Recuerda guardar los parámetros.', style: TextStyle(color: Colors.white70)),
          alignment: Alignment.$1,
          autoCloseDuration: const Duration(seconds: 4),
          backgroundColor: AppColors.surface,
          primaryColor: AppColors.winGreen,
          icon: const Icon(Icons.check_circle, color: AppColors.winGreen),
          showProgressBar: false,`
    );

    // Error toasts generating keys
    content = content.replace(
        /style: ToastificationStyle\.flatColored,\s*title: const Text\('Error al generar llaves'\),\s*description: Text\(e\.toString\(\)\),\s*alignment: Alignment\.(topRight|topCenter),\s*autoCloseDuration: const Duration\(seconds: 4\),/g,
        `style: ToastificationStyle.fillColored,
        title: const Text('Error', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        description: Text(e.toString(), style: const TextStyle(color: Colors.white70)),
        alignment: Alignment.$1,
        autoCloseDuration: const Duration(seconds: 4),
        backgroundColor: AppColors.surface,
        primaryColor: AppColors.lossRed,
        icon: const Icon(Icons.error, color: AppColors.lossRed),
        showProgressBar: false,`
    );

    // Info toasts saving
    content = content.replace(
        /toastification\.show\(context: context, type: ToastificationType\.info, style: ToastificationStyle\.flatColored, title: const Text\('Guardando configuración\.\.\.'\), alignment: Alignment\.(topRight|topCenter), autoCloseDuration: const Duration\(seconds: 2\)\);/g,
        `toastification.show(context: context, type: ToastificationType.info, style: ToastificationStyle.fillColored, title: const Text('Guardando configuración...', style: TextStyle(color: Colors.white)), alignment: Alignment.$1, autoCloseDuration: const Duration(seconds: 2), backgroundColor: AppColors.surface, primaryColor: AppColors.brandBlue, showProgressBar: false);`
    );

    // Success toasts saving
    content = content.replace(
        /toastification\.show\(context: context, type: ToastificationType\.success, style: ToastificationStyle\.flatColored, title: const Text\('Configuración guardada'\), alignment: Alignment\.(topRight|topCenter), autoCloseDuration: const Duration\(seconds: 3\)\);/g,
        `toastification.show(context: context, type: ToastificationType.success, style: ToastificationStyle.fillColored, title: const Text('Configuración guardada', style: TextStyle(color: Colors.white)), alignment: Alignment.$1, autoCloseDuration: const Duration(seconds: 3), backgroundColor: AppColors.surface, primaryColor: AppColors.winGreen, showProgressBar: false);`
    );

    // Error toasts saving
    content = content.replace(
        /toastification\.show\(context: context, type: ToastificationType\.error, style: ToastificationStyle\.flatColored, title: const Text\('Error al guardar'\), description: Text\(e\.toString\(\)\), alignment: Alignment\.(topRight|topCenter), autoCloseDuration: const Duration\(seconds: 4\)\);/g,
        `toastification.show(context: context, type: ToastificationType.error, style: ToastificationStyle.fillColored, title: const Text('Error al guardar', style: TextStyle(color: Colors.white)), description: Text(e.toString(), style: const TextStyle(color: Colors.white70)), alignment: Alignment.$1, autoCloseDuration: const Duration(seconds: 4), backgroundColor: AppColors.surface, primaryColor: AppColors.lossRed, showProgressBar: false);`
    );

    fs.writeFileSync(filePath, content);
}

styleToasts("app/lib/screens/dashboard/desktop_settings.dart");
styleToasts("app/lib/screens/dashboard/mobile_settings.dart");
