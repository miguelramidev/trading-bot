import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/app_toast.dart';
import '../../providers/dashboard_provider.dart';
import '../../widgets/widgets.dart';
import 'settings_controller.dart';
import 'settings_sections.dart';

class DesktopSettings extends StatelessWidget {
  const DesktopSettings({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => SettingsController(),
      child: const _DesktopSettingsView(),
    );
  }
}

class _DesktopSettingsView extends StatelessWidget {
  const _DesktopSettingsView();

  @override
  Widget build(BuildContext context) {
    final balance = context.watch<DashboardProvider>().balance;

    return Scaffold(
      backgroundColor: DsColors.background,
      body: Consumer<SettingsController>(
        builder: (context, controller, _) {
          if (controller.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (controller.loadError != null) {
            return ErrorState(message: controller.loadError!, actionLabel: 'Reintentar', onAction: controller.reload);
          }

          return Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.huger, AppSpacing.xxl, AppSpacing.huger, AppSpacing.xl),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Configuración', style: AppTextStyles.title.copyWith(color: DsColors.textPrimary)),
                      const SizedBox(height: AppSpacing.xs),
                      Text('Cómo opera el bot con tu cuenta de Binance', style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
                      const SizedBox(height: AppSpacing.xl),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                buildBotSwitchSection(controller),
                                const SizedBox(height: AppSpacing.lg),
                                buildCapitalRiskSection(controller, accountBalance: balance),
                              ],
                            ),
                          ),
                          const SizedBox(width: AppSpacing.xl),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                buildBinanceConnectionSection(controller, onToggleReplace: () => controller.setReplacingKeys(!controller.replacingKeys)),
                                const SizedBox(height: AppSpacing.lg),
                                buildNotificationsSection(controller),
                                const SizedBox(height: AppSpacing.lg),
                                buildRsaKeysSection(
                                  controller,
                                  onGenerate: () async {
                                    final ok = await controller.generateRsaKeys();
                                    if (context.mounted) {
                                      if (ok) {
                                        AppToast.showSuccess(context, 'Llave generada. Pegala en Binance.');
                                      } else {
                                        AppToast.showError(context, 'No se pudo generar la llave.');
                                      }
                                    }
                                  },
                                  onCopy: () {
                                    Clipboard.setData(ClipboardData(text: controller.rsaPublicKey ?? ''));
                                    AppToast.showInfo(context, 'Llave pública copiada.');
                                  },
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              buildSaveBar(
                controller,
                onDiscard: controller.discardChanges,
                onSave: () async {
                  final ok = await controller.save();
                  if (context.mounted) {
                    if (ok) {
                      AppToast.showSuccess(context, 'Configuración guardada.');
                    } else {
                      AppToast.showError(context, controller.saveError ?? 'No se pudo guardar.');
                    }
                  }
                },
              ),
            ],
          );
        },
      ),
    );
  }
}
