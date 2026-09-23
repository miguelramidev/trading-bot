import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/mobile_settings.dart", "utf8");

const oldWidget = `                  const Text('API SECRET (HARDWARE VAULT)', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _apiSecretController,
                    obscureText: true,
                    style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 12),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: AppColors.background,
                      enabledBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
                      focusedBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.winGreen), borderRadius: BorderRadius.circular(8)),
                      suffixIcon: const Icon(Icons.lock_outline, color: AppColors.textSecondary, size: 16),
                    ),
                  ),`;

const newWidget = `                  const Text('GENERADOR DE LLAVES RSA (BYPASS IP)', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Generando par de llaves RSA...'), backgroundColor: AppColors.winGreen));
                      },
                      icon: const Icon(Icons.key, color: AppColors.winGreen, size: 16),
                      label: const Text('Generar Llave Pública', style: TextStyle(color: AppColors.winGreen)),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: AppColors.winGreen),
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text('LLAVE PÚBLICA (PEGA ESTO EN BINANCE)', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(8), border: Border.all(color: AppColors.border)),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(child: Text('-----BEGIN PUBLIC KEY-----\\nMIIBIjANBgkqhkiG...\\n-----END PUBLIC KEY-----', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10))),
                        const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),
                      ],
                    ),
                  ),`;

content = content.replace(oldWidget, newWidget);
fs.writeFileSync("app/lib/screens/dashboard/mobile_settings.dart", content);
