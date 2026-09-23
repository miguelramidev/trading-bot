import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/mobile_settings.dart", "utf8");

// 1. Add controllers
if (!content.includes("_amountController")) {
    content = content.replace(
        "final _apiSecretController = TextEditingController();",
        "final _apiSecretController = TextEditingController();\n  final _amountController = TextEditingController(text: '25.00');\n  final _tradesController = TextEditingController(text: '5');\n  final _leverageController = TextEditingController(text: '10');"
    );
}

// 2. Change the static fields
// Mobile has:
// _inputRow('Monto Fijo por Operación', '\$', '25.00 USDT'),
// _inputRowVertical('OPERACIONES SIMULTÁNEAS', '5')
// _inputRowVertical('APALANCAMIENTO MÁX', '10x')

content = content.replace(
    "_inputRow('Monto Fijo por Operación', '\\$', '25.00 USDT'),",
    "_editableRow('Monto Fijo por Operación', '\\$', 'USDT', _amountController),"
);

content = content.replace(
    "Expanded(child: _inputRowVertical('OPERACIONES SIMULTÁNEAS', '5')),",
    "Expanded(child: _editableRowVertical('OPERACIONES SIMUL.', '', _tradesController)),"
);

content = content.replace(
    "Expanded(child: _inputRowVertical('APALANCAMIENTO MÁX', '10x')),",
    "Expanded(child: _editableRowVertical('APALANCAMIENTO', 'x', _leverageController)),"
);

const editableWidgets = `  Widget _editableRow(String label, String prefix, String suffix, TextEditingController controller) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
        SizedBox(
          width: 120,
          height: 40,
          child: TextField(
            controller: controller,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.right,
            style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontWeight: FontWeight.bold),
            decoration: InputDecoration(
              prefixText: prefix,
              suffixText: ' '+suffix,
              prefixStyle: const TextStyle(color: AppColors.textSecondary),
              suffixStyle: const TextStyle(color: AppColors.textSecondary),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              filled: true,
              fillColor: AppColors.background,
              enabledBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
              focusedBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.winGreen), borderRadius: BorderRadius.circular(8)),
            ),
          ),
        ),
      ],
    );
  }

  Widget _editableRowVertical(String label, String suffix, TextEditingController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
        const SizedBox(height: 8),
        SizedBox(
          height: 40,
          child: TextField(
            controller: controller,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontWeight: FontWeight.bold),
            decoration: InputDecoration(
              suffixText: suffix,
              suffixStyle: const TextStyle(color: AppColors.textSecondary),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              filled: true,
              fillColor: AppColors.background,
              enabledBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
              focusedBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.winGreen), borderRadius: BorderRadius.circular(8)),
            ),
          ),
        )
      ],
    );
  }`;

if (!content.includes("_editableRow(String label")) {
    content = content.replace("Widget _inputRow(String label", editableWidgets + "\n\n  Widget _inputRow(String label");
}

// 3. Remove IP Whitelist
const ipWhitelistSectionMobile = `                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(color: AppColors.winGreen.withOpacity(0.05), borderRadius: BorderRadius.circular(8), border: Border.all(color: AppColors.winGreen.withOpacity(0.3))),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('185.220.101.44 (IP Bot)', style: AppTheme.monoStyle.copyWith(color: AppColors.winGreen, fontSize: 12, fontWeight: FontWeight.bold)),
                        const Icon(Icons.copy, color: AppColors.winGreen, size: 16),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text('Esta es la IP de nuestros servidores. Añádela al "IP Whitelist" de tu API Key en Binance por seguridad.', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),`;

content = content.replace(ipWhitelistSectionMobile, "");

fs.writeFileSync("app/lib/screens/dashboard/mobile_settings.dart", content);
