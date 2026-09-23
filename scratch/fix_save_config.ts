import fs from "fs";

function fixDesktop() {
    let content = fs.readFileSync("app/lib/screens/dashboard/desktop_settings.dart", "utf8");

    const oldSave = /Future<void> _saveConfig\(\) async \{[\s\S]*?if \(mounted\) setState\(\(\) => _isGeneratingKeys = false\);\n    \}\n  \}/;
    
    const newSave = `Future<void> _saveConfig() async {
    setState(() => _isSaving = true);
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    try {
      final response = await http.put(
        Uri.parse('https://d283s0b41l.execute-api.ca-central-1.amazonaws.com/api/users/config'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer \${user.uid}',
        },
        body: jsonEncode({
          'binanceApiKey': _apiKeyController.text,
          'binanceApiSecret': _apiSecretController.text,
          'montoOperacion': int.tryParse(_amountController.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 25,
          'maxTrades': int.tryParse(_tradesController.text) ?? 5,
          'apalancamiento': int.tryParse(_leverageController.text) ?? 10,
          if (_rsaPublicKey != null) 'rsaPublicKey': _rsaPublicKey,
          if (_rsaPrivateKey != null) 'rsaPrivateKey': _rsaPrivateKey,
        }),
      );

      if (response.statusCode == 200 && mounted) {
        toastification.show(
          context: context,
          type: ToastificationType.success,
          style: ToastificationStyle.fillColored,
          title: const Text('Configuración Guardada', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          description: const Text('Los parámetros se han actualizado correctamente.', style: TextStyle(color: Colors.white70)),
          alignment: Alignment.topRight,
          autoCloseDuration: const Duration(seconds: 3),
          backgroundColor: AppColors.surface,
          primaryColor: AppColors.winGreen,
          icon: const Icon(Icons.check_circle, color: AppColors.winGreen),
          showProgressBar: false,
        );
      } else {
         throw Exception('Error al guardar en el servidor');
      }
    } catch (e) {
      if (!mounted) return;
      toastification.show(
        context: context,
        type: ToastificationType.error,
        style: ToastificationStyle.fillColored,
        title: const Text('Error', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        description: Text(e.toString(), style: const TextStyle(color: Colors.white70)),
        alignment: Alignment.topRight,
        autoCloseDuration: const Duration(seconds: 4),
        backgroundColor: AppColors.surface,
        primaryColor: AppColors.lossRed,
        icon: const Icon(Icons.error, color: AppColors.lossRed),
        showProgressBar: false,
      );
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }`;
    
    content = content.replace(oldSave, newSave);
    fs.writeFileSync("app/lib/screens/dashboard/desktop_settings.dart", content);
}

function fixMobile() {
    let content = fs.readFileSync("app/lib/screens/dashboard/mobile_settings.dart", "utf8");

    const oldSave = /Future<void> _saveConfig\(\) async \{[\s\S]*?if \(mounted\) setState\(\(\) => _isGeneratingKeys = false\);\n    \}\n  \}/;
    
    const newSave = `Future<void> _saveConfig() async {
    setState(() => _isSaving = true);
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    try {
      final response = await http.put(
        Uri.parse('https://d283s0b41l.execute-api.ca-central-1.amazonaws.com/api/users/config'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer \${user.uid}',
        },
        body: jsonEncode({
          'binanceApiKey': _apiKeyController.text,
          'montoOperacion': int.tryParse(_amountController.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 25,
          'maxTrades': int.tryParse(_tradesController.text) ?? 5,
          'apalancamiento': int.tryParse(_leverageController.text) ?? 10,
          if (_rsaPublicKey != null) 'rsaPublicKey': _rsaPublicKey,
          if (_rsaPrivateKey != null) 'rsaPrivateKey': _rsaPrivateKey,
        }),
      );

      if (response.statusCode == 200 && mounted) {
        toastification.show(
          context: context,
          type: ToastificationType.success,
          style: ToastificationStyle.fillColored,
          title: const Text('Configuración Guardada', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          description: const Text('Los parámetros se han actualizado correctamente.', style: TextStyle(color: Colors.white70)),
          alignment: Alignment.topCenter,
          autoCloseDuration: const Duration(seconds: 3),
          backgroundColor: AppColors.surface,
          primaryColor: AppColors.winGreen,
          icon: const Icon(Icons.check_circle, color: AppColors.winGreen),
          showProgressBar: false,
        );
      } else {
         throw Exception('Error al guardar en el servidor');
      }
    } catch (e) {
      if (!mounted) return;
      toastification.show(
        context: context,
        type: ToastificationType.error,
        style: ToastificationStyle.fillColored,
        title: const Text('Error', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        description: Text(e.toString(), style: const TextStyle(color: Colors.white70)),
        alignment: Alignment.topCenter,
        autoCloseDuration: const Duration(seconds: 4),
        backgroundColor: AppColors.surface,
        primaryColor: AppColors.lossRed,
        icon: const Icon(Icons.error, color: AppColors.lossRed),
        showProgressBar: false,
      );
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }`;

    content = content.replace(oldSave, newSave);
    fs.writeFileSync("app/lib/screens/dashboard/mobile_settings.dart", content);
}

fixDesktop();
fixMobile();
