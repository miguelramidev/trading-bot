import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/desktop_settings.dart", "utf8");

content = content.replace("import 'package:crypton/crypton.dart';", "import 'dart:convert';\nimport 'package:toastification/toastification.dart';\nimport 'package:firebase_auth/firebase_auth.dart';");

const oldGenerate = `  void _generateRSA() {
    setState(() => _isLoading = true);
    Future.microtask(() {
      try {
        final rsaKeypair = RSAKeypair.fromRandom();
        setState(() {
          _rsaPublicKey = rsaKeypair.publicKey.toString();
          _rsaPrivateKey = rsaKeypair.privateKey.toString();
        });
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ Par de llaves generadas. Copia la pública a Binance.'), backgroundColor: AppColors.winGreen));
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.lossRed));
      } finally {
        setState(() => _isLoading = false);
      }
    });
  }`;

const newGenerate = `  Future<void> _generateRSA() async {
    setState(() => _isLoading = true);
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;
      
      final response = await http.post(
        Uri.parse('https://d283s0b41l.execute-api.ca-central-1.amazonaws.com/api/users/keys/generate'),
        headers: {
          'Authorization': 'Bearer \${user.uid}',
          'Content-Type': 'application/json',
        },
      );
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() {
          _rsaPublicKey = data['publicKey'];
        });
        
        if (!mounted) return;
        toastification.show(
          context: context,
          type: ToastificationType.success,
          style: ToastificationStyle.flatColored,
          title: const Text('Llaves Generadas Exitosamente'),
          description: const Text('Copia la llave pública a Binance. La privada se ha guardado encriptada.'),
          alignment: Alignment.topRight,
          autoCloseDuration: const Duration(seconds: 4),
          backgroundColor: AppColors.winGreen.withValues(alpha: 0.1),
          foregroundColor: AppColors.winGreen,
          icon: const Icon(Icons.check_circle, color: AppColors.winGreen),
        );
      } else {
        throw Exception('Error del servidor: \${response.statusCode}');
      }
    } catch (e) {
      if (!mounted) return;
      toastification.show(
        context: context,
        type: ToastificationType.error,
        style: ToastificationStyle.flatColored,
        title: const Text('Error al generar llaves'),
        description: Text(e.toString()),
        alignment: Alignment.topRight,
        autoCloseDuration: const Duration(seconds: 4),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }`;

content = content.replace(oldGenerate, newGenerate);

content = content.replace(
    "ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Guardando configuración...'), backgroundColor: AppColors.brandBlue));",
    "toastification.show(context: context, type: ToastificationType.info, style: ToastificationStyle.flatColored, title: const Text('Guardando configuración...'), alignment: Alignment.topRight, autoCloseDuration: const Duration(seconds: 2));"
);

content = content.replace(
    "ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Configuración guardada exitosamente'), backgroundColor: AppColors.winGreen));",
    "toastification.show(context: context, type: ToastificationType.success, style: ToastificationStyle.flatColored, title: const Text('Configuración guardada'), alignment: Alignment.topRight, autoCloseDuration: const Duration(seconds: 3));"
);

content = content.replace(
    "ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.lossRed));",
    "toastification.show(context: context, type: ToastificationType.error, style: ToastificationStyle.flatColored, title: const Text('Error al guardar'), description: Text(e.toString()), alignment: Alignment.topRight, autoCloseDuration: const Duration(seconds: 4));"
);

const oldButtonChild = `const Text('Generar Llave Pública', style: TextStyle(fontWeight: FontWeight.w600))`;
const newButtonChild = `_isLoading 
                              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) 
                              : const Text('Generar Llave Pública', style: TextStyle(fontWeight: FontWeight.w600))`;

content = content.replace(oldButtonChild, newButtonChild);

fs.writeFileSync("app/lib/screens/dashboard/desktop_settings.dart", content);
