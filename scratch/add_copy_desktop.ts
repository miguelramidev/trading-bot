import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/desktop_settings.dart", "utf8");

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
                      alignment: Alignment.topRight,
                      autoCloseDuration: const Duration(seconds: 2),
                      backgroundColor: AppColors.surface,
                      primaryColor: AppColors.winGreen,
                      icon: const Icon(Icons.check, color: AppColors.winGreen),
                      showProgressBar: false,
                    );
                  } : null,
                ),`;

content = content.replace(oldIcon, newIcon);

fs.writeFileSync("app/lib/screens/dashboard/desktop_settings.dart", content);
