import fs from "fs";

function fixFile(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");

    if (!content.includes("package:flutter/services.dart")) {
        content = content.replace(
            "import 'package:flutter/material.dart';",
            "import 'package:flutter/material.dart';\nimport 'package:flutter/services.dart';"
        );
    }

    const oldIcon = `const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),`;
    const newIcon = `IconButton(
                  icon: const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),
                  onPressed: _rsaPublicKey != null ? () {
                    Clipboard.setData(ClipboardData(text: _rsaPublicKey!));
                    toastification.show(
                      context: context,
                      type: ToastificationType.success,
                      style: ToastificationStyle.fillColored,
                      title: const Text('Copiado', style: TextStyle(color: Colors.white)),
                      description: const Text('Llave pública copiada al portapapeles', style: TextStyle(color: Colors.white70)),
                      alignment: filePath.includes("desktop") ? Alignment.topRight : Alignment.topCenter,
                      autoCloseDuration: const Duration(seconds: 2),
                      backgroundColor: AppColors.surface,
                      primaryColor: AppColors.winGreen,
                      icon: const Icon(Icons.check, color: AppColors.winGreen),
                      showProgressBar: false,
                    );
                  } : null,
                ),`;
    
    // Desktop has "const Icon(Icons.copy...)" inside the Row
    content = content.replace("const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),", newIcon.replace("filePath.includes(\"desktop\")", "true"));

    fs.writeFileSync(filePath, content);
}

fixFile("app/lib/screens/dashboard/desktop_settings.dart");

function fixMobile(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");

    if (!content.includes("package:flutter/services.dart")) {
        content = content.replace(
            "import 'package:flutter/material.dart';",
            "import 'package:flutter/material.dart';\nimport 'package:flutter/services.dart';"
        );
    }

    const newIcon = `IconButton(
                  icon: const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),
                  onPressed: _rsaPublicKey != null ? () {
                    Clipboard.setData(ClipboardData(text: _rsaPublicKey!));
                    toastification.show(
                      context: context,
                      type: ToastificationType.success,
                      style: ToastificationStyle.fillColored,
                      title: const Text('Copiado', style: TextStyle(color: Colors.white)),
                      description: const Text('Llave pública copiada al portapapeles', style: TextStyle(color: Colors.white70)),
                      alignment: Alignment.topCenter,
                      autoCloseDuration: const Duration(seconds: 2),
                      backgroundColor: AppColors.surface,
                      primaryColor: AppColors.winGreen,
                      icon: const Icon(Icons.check, color: AppColors.winGreen),
                      showProgressBar: false,
                    );
                  } : null,
                ),`;
    
    content = content.replace("const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),", newIcon);

    fs.writeFileSync(filePath, content);
}

fixMobile("app/lib/screens/dashboard/mobile_settings.dart");
