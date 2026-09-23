import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/mobile_settings.dart", "utf8");

if (!content.includes("package:crypton/crypton.dart")) {
    content = content.replace("import 'package:http/http.dart' as http;", "import 'package:http/http.dart' as http;\nimport 'package:crypton/crypton.dart';");
}

if (!content.includes("String? _rsaPublicKey;")) {
    content = content.replace("bool _isLoading = false;", "bool _isLoading = false;\n  String? _rsaPublicKey;\n  String? _rsaPrivateKey;");
}

const generateRsaCode = `
  void _generateRSA() {
    setState(() => _isLoading = true);
    Future.microtask(() {
      try {
        final rsaKeypair = RSAKeypair.fromRandom();
        setState(() {
          _rsaPublicKey = rsaKeypair.publicKey.toString();
          _rsaPrivateKey = rsaKeypair.privateKey.toString();
        });
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ Par de llaves generadas. Copia la pública a Binance.'), backgroundColor: AppColors.winGreen));
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.lossRed));
      } finally {
        setState(() => _isLoading = false);
      }
    });
  }
`;

if (!content.includes("_generateRSA()")) {
    content = content.replace("  Future<void> _saveConfig()", generateRsaCode + "\n  Future<void> _saveConfig()");
}

const oldSavePayload = `        body: jsonEncode({
          'binanceApiKey': _apiKeyController.text,
          'montoOperacion': int.tryParse(_amountController.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 25,
          'maxTrades': int.tryParse(_tradesController.text) ?? 5,
          'apalancamiento': int.tryParse(_leverageController.text) ?? 10,
        }),`;

const newSavePayload = `        body: jsonEncode({
          'binanceApiKey': _apiKeyController.text,
          'montoOperacion': int.tryParse(_amountController.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 25,
          'maxTrades': int.tryParse(_tradesController.text) ?? 5,
          'apalancamiento': int.tryParse(_leverageController.text) ?? 10,
          if (_rsaPublicKey != null) 'rsaPublicKey': _rsaPublicKey,
          if (_rsaPrivateKey != null) 'rsaPrivateKey': _rsaPrivateKey,
        }),`;

content = content.replace(oldSavePayload, newSavePayload);

const oldRsaButton = `onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Generando par de llaves RSA...'), backgroundColor: AppColors.winGreen));
                      },`;
const newRsaButton = `onPressed: _isLoading ? null : _generateRSA,`;
content = content.replace(oldRsaButton, newRsaButton);

const oldRsaBox = `Text('-----BEGIN PUBLIC KEY-----\\nMIIBIjANBgkqhkiG...\\n-----END PUBLIC KEY-----', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10))`;
const newRsaBox = `Text(_rsaPublicKey ?? 'Presiona el botón para generar...', style: AppTheme.monoStyle.copyWith(color: _rsaPublicKey != null ? AppColors.textPrimary : AppColors.textSecondary, fontSize: 10))`;
content = content.replace(oldRsaBox, newRsaBox);

fs.writeFileSync("app/lib/screens/dashboard/mobile_settings.dart", content);
