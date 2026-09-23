import fs from "fs";

function fixDesktop() {
    let content = fs.readFileSync("app/lib/screens/dashboard/desktop_settings.dart", "utf8");

    // Fix the API key one (revert to normal icon if it was changed)
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
    content = content.replace(badIconButton, "suffixIcon: const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),");

    // Replace the ACTUAL RSA key copy icon
    const staticIcon = `Expanded(child: SelectableText(_rsaPublicKey ?? 'Presiona el botón para generar...', style: AppTheme.monoStyle.copyWith(color: _rsaPublicKey != null ? AppColors.textPrimary : AppColors.textSecondary, fontSize: 10))),
                const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),`;
    
    const functionalIconButton = `Expanded(child: SelectableText(_rsaPublicKey ?? 'Presiona el botón para generar...', style: AppTheme.monoStyle.copyWith(color: _rsaPublicKey != null ? AppColors.textPrimary : AppColors.textSecondary, fontSize: 10))),
                IconButton(
                  icon: const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),
                  onPressed: _rsaPublicKey != null ? () {
                    Clipboard.setData(ClipboardData(text: _rsaPublicKey!));
                    toastification.show(
                      context: context,
                      type: ToastificationType.success,
                      style: ToastificationStyle.fillColored,
                      title: const Text('Copiado', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
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
    
    content = content.replace(staticIcon, functionalIconButton);
    fs.writeFileSync("app/lib/screens/dashboard/desktop_settings.dart", content);
}

function fixMobile() {
    let content = fs.readFileSync("app/lib/screens/dashboard/mobile_settings.dart", "utf8");

    // Revert the API Key one
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
                      alignment: Alignment.topCenter,
                      autoCloseDuration: const Duration(seconds: 2),
                      backgroundColor: AppColors.surface,
                      primaryColor: AppColors.winGreen,
                      icon: const Icon(Icons.check, color: AppColors.winGreen),
                      showProgressBar: false,
                    );
                  } : null,
                ),`;
    content = content.replace(badIconButton, "suffixIcon: const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),");

    // Fix the ACTUAL RSA key copy icon
    const staticIcon = `Expanded(child: SelectableText(_rsaPublicKey ?? 'Presiona el botón para generar...', style: AppTheme.monoStyle.copyWith(color: _rsaPublicKey != null ? AppColors.textPrimary : AppColors.textSecondary, fontSize: 10))),
                        const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),`;
    
    const functionalIconButton = `Expanded(child: SelectableText(_rsaPublicKey ?? 'Presiona el botón para generar...', style: AppTheme.monoStyle.copyWith(color: _rsaPublicKey != null ? AppColors.textPrimary : AppColors.textSecondary, fontSize: 10))),
                        IconButton(
                          icon: const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),
                          onPressed: _rsaPublicKey != null ? () {
                            Clipboard.setData(ClipboardData(text: _rsaPublicKey!));
                            toastification.show(
                              context: context,
                              type: ToastificationType.success,
                              style: ToastificationStyle.fillColored,
                              title: const Text('Copiado', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
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
                        
    content = content.replace(staticIcon, functionalIconButton);
    fs.writeFileSync("app/lib/screens/dashboard/mobile_settings.dart", content);
}

fixDesktop();
fixMobile();
