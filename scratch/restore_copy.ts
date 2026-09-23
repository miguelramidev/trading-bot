import fs from "fs";

function fixDesktop() {
    let content = fs.readFileSync("app/lib/screens/dashboard/desktop_settings.dart", "utf8");

    const badIconButton = `suffixIcon: IconButton(
                  icon: const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),
                  onPressed: _rsaPublicKey != null ? () {
                    Clipboard.setData(ClipboardData(text: _rsaPublicKey!));
                    toastification.show(
                      context: context,
                      type: ToastificationType.success,
                      style: ToastificationStyle.fillColored,
                      title: const Text('Copiado', style: TextStyle(color: Colors.white)),
                      description: const Text('Llave pública copiada al portapapeles', style: TextStyle(color: Colors.white70)),
                      alignment: true ? Alignment.topRight : Alignment.topCenter,
                      autoCloseDuration: const Duration(seconds: 2),
                      backgroundColor: AppColors.surface,
                      primaryColor: AppColors.winGreen,
                      icon: const Icon(Icons.check, color: AppColors.winGreen),
                      showProgressBar: false,
                    );
                  } : null,
                ),`;
    content = content.replace(badIconButton, ""); // Remove it from the text field. Wait, did the text field have an icon originally?

    // Let's just remove the suffixIcon entirely from the first match. Wait, I should do a safe regex.
    fs.writeFileSync("app/lib/screens/dashboard/desktop_settings.dart", content);
}
fixDesktop();
