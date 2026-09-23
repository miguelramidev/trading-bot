import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/desktop_settings.dart", "utf8");

// 1. Add controllers
if (!content.includes("_amountController")) {
    content = content.replace(
        "final _apiSecretController = TextEditingController();",
        "final _apiSecretController = TextEditingController();\n  final _amountController = TextEditingController(text: '25.00');\n  final _tradesController = TextEditingController(text: '5');\n  final _leverageController = TextEditingController(text: '10');"
    );
}

// 2. Change the static _inputField and its usages
// Old:
// _inputField('Monto por Operación (\$)', '\$25.00 USDT'),
// _inputField('Límite de Trades Simultáneos', '5'),
// _inputField('Max Leverage (Apalancamiento)', '10x'),
// _inputField('Stop Loss Global de Emergencia', '3.5% Drawdown Diario', isDanger: true),

content = content.replace("_inputField('Monto por Operación (\\$)', '\\$25.00 USDT')", "_editableField('Monto por Operación (\\$)', 'USDT', _amountController)");
content = content.replace("_inputField('Límite de Trades Simultáneos', '5')", "_editableField('Límite de Trades Simultáneos', 'Trades', _tradesController)");
content = content.replace("_inputField('Max Leverage (Apalancamiento)', '10x')", "_editableField('Max Leverage (Apalancamiento)', 'x', _leverageController)");

const editableFieldDef = `  Widget _editableField(String label, String suffix, TextEditingController controller, {bool isDanger = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          style: AppTheme.monoStyle.copyWith(color: isDanger ? AppColors.lossRed : AppColors.textPrimary),
          decoration: InputDecoration(
            filled: true,
            fillColor: AppColors.background,
            suffixText: suffix,
            suffixStyle: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
            enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: isDanger ? AppColors.lossRed.withOpacity(0.5) : AppColors.border), borderRadius: BorderRadius.circular(8)),
            focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: isDanger ? AppColors.lossRed : AppColors.winGreen), borderRadius: BorderRadius.circular(8)),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          ),
        ),
      ],
    );
  }`;

if (!content.includes("_editableField(String label")) {
    content = content.replace("Widget _inputField", editableFieldDef + "\n\n  Widget _inputField");
}

// 3. Remove IP Whitelist
const ipWhitelistSection = `          const SizedBox(height: 24),
          const Text('Restricción de IP (Whitelisted Gateway)', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(color: AppColors.winGreen.withOpacity(0.05), borderRadius: BorderRadius.circular(8), border: Border.all(color: AppColors.winGreen.withOpacity(0.3))),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('185.220.101.44', style: AppTheme.monoStyle.copyWith(color: AppColors.winGreen, fontSize: 14, fontWeight: FontWeight.bold)),
                const Icon(Icons.check_circle, color: AppColors.winGreen, size: 16),
              ],
            ),
          ),
          const SizedBox(height: 8),
          const Text('Añade esta IP a tu API Key en Binance para mayor seguridad.', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),`;

content = content.replace(ipWhitelistSection, "");

fs.writeFileSync("app/lib/screens/dashboard/desktop_settings.dart", content);
