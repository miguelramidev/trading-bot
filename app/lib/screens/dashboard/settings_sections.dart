import 'package:flutter/material.dart';
import '../../core/theme/ds_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/result_formatter.dart';
import '../../widgets/widgets.dart';
import 'settings_controller.dart';

/// Secciones de Configuración, compartidas entre mobile y desktop (sección 5
/// "Configuración" del documento de diseño).

Widget buildBotSwitchSection(SettingsController controller) {
  return AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Generar señales', style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    'El bot analiza el mercado cada 15 minutos y te avisa cuando encuentra una señal. Pausarlo no afecta tus posiciones abiertas ni sus stops.',
                    style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            AppSwitch(value: controller.isBotActive, onChanged: controller.toggleBot),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        const Callout(message: 'La ejecución es siempre manual: ninguna orden se coloca sin tu confirmación.'),
      ],
    ),
  );
}

Widget buildCapitalRiskSection(SettingsController controller, {required double? accountBalance}) {
  final error = controller.validationError;
  final entries = (accountBalance != null && controller.montoOperacion > 0) ? (accountBalance / controller.montoOperacion).floor() : null;

  return AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Capital y riesgo', style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
        const SizedBox(height: AppSpacing.lg),
        Row(
          children: [
            Expanded(
              child: LabeledField(
                label: 'Margen por operación',
                controller: TextEditingController(text: controller.montoOperacion.toStringAsFixed(2))..selection = TextSelection.collapsed(offset: controller.montoOperacion.toStringAsFixed(2).length),
                suffix: 'USDT',
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                onChanged: (v) => controller.setMontoOperacion(double.tryParse(v) ?? controller.montoOperacion),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: LabeledField(
                label: 'Operaciones simultáneas',
                controller: TextEditingController(text: '${controller.maxTrades}')..selection = TextSelection.collapsed(offset: '${controller.maxTrades}'.length),
                suffix: 'máximo',
                keyboardType: TextInputType.number,
                onChanged: (v) => controller.setMaxTrades(int.tryParse(v) ?? controller.maxTrades),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        Text('Apalancamiento', style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            Expanded(
              child: LabeledField(
                label: 'Mínimo',
                controller: TextEditingController(text: '${controller.leverageMin}')..selection = TextSelection.collapsed(offset: '${controller.leverageMin}'.length),
                suffix: 'x',
                keyboardType: TextInputType.number,
                onChanged: (v) => controller.setLeverageMin(int.tryParse(v) ?? controller.leverageMin),
              ),
            ),
            const Padding(padding: EdgeInsets.symmetric(horizontal: AppSpacing.sm), child: Text('a', style: TextStyle(color: DsColors.textTertiary))),
            Expanded(
              child: LabeledField(
                label: 'Máximo',
                controller: TextEditingController(text: '${controller.leverageMax}')..selection = TextSelection.collapsed(offset: '${controller.leverageMax}'.length),
                suffix: 'x',
                keyboardType: TextInputType.number,
                onChanged: (v) => controller.setLeverageMax(int.tryParse(v) ?? controller.leverageMax),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          'El bot usa el mínimo y solo sube hasta el máximo si Binance exige un nocional mayor. Si ni con el máximo alcanza, rechaza la operación.',
          style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary),
        ),
        if (error != null) ...[
          const SizedBox(height: AppSpacing.md),
          Callout(variant: CalloutVariant.warning, icon: Icons.error_outline, message: error),
        ] else if (entries != null) ...[
          const SizedBox(height: AppSpacing.md),
          Callout(
            variant: CalloutVariant.warning,
            icon: Icons.info_outline,
            message: entries >= controller.maxTrades
                ? 'Con tu balance de ${fmtUsd(accountBalance, signed: false)} y ${fmtUsd(controller.montoOperacion, signed: false)} por operación, entran las ${controller.maxTrades} operaciones configuradas.'
                : 'Con tu balance de ${fmtUsd(accountBalance, signed: false)} y ${fmtUsd(controller.montoOperacion, signed: false)} por operación, ${entries <= 1 ? 'solo entra una operación' : 'solo entran $entries operaciones'} a la vez: el límite de ${controller.maxTrades} no se va a alcanzar.',
          ),
        ],
      ],
    ),
  );
}

Widget buildBinanceConnectionSection(SettingsController controller, {required VoidCallback onToggleReplace}) {
  final keyInfo = controller.binanceKeyInfo;
  final connected = controller.hasBinanceKeys;

  return AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Conexión con Binance', style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(width: 8, height: 8, decoration: BoxDecoration(color: connected ? DsColors.positive : DsColors.textTertiary, shape: BoxShape.circle)),
                const SizedBox(width: AppSpacing.sm),
                Text(connected ? 'Conectada' : 'Sin configurar', style: AppTextStyles.bodySmall.copyWith(color: connected ? DsColors.positive : DsColors.textSecondary)),
              ],
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        _connectionRow('Tipo de clave', controller.hasRsaKeys ? 'Asimétrica (RSA/Ed25519)' : (connected ? 'HMAC' : fmtMissing())),
        _connectionRow('Futuros', keyInfo == null ? fmtMissing() : (keyInfo['futuresEnabled'] == true ? 'Habilitado' : 'Deshabilitado')),
        _connectionRow('Retiros', keyInfo == null ? fmtMissing() : (keyInfo['withdrawalsDisabled'] == true ? 'Deshabilitados' : 'Habilitados'), warn: keyInfo != null && keyInfo['withdrawalsDisabled'] != true),
        const SizedBox(height: AppSpacing.md),
        SecondaryButton(label: controller.replacingKeys ? 'Cancelar' : 'Reemplazar claves', onPressed: onToggleReplace),
        if (controller.replacingKeys) ...[
          const SizedBox(height: AppSpacing.md),
          LabeledField(label: 'Nueva API key', controller: TextEditingController(text: controller.binanceApiKeyInput), onChanged: controller.setBinanceApiKeyInput),
          const SizedBox(height: AppSpacing.sm),
          LabeledField(label: 'Nuevo API secret', controller: TextEditingController(text: controller.binanceApiSecretInput), onChanged: controller.setBinanceApiSecretInput),
        ],
      ],
    ),
  );
}

Widget _connectionRow(String label, String value, {bool warn = false}) {
  return Container(
    padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
    decoration: const BoxDecoration(border: Border(top: BorderSide(color: DsColors.divider))),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
        Text(value, style: AppTextStyles.body.copyWith(color: warn ? DsColors.warning : DsColors.textPrimary)),
      ],
    ),
  );
}

Widget buildNotificationsSection(SettingsController controller) {
  return AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Notificaciones', style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
        const SizedBox(height: AppSpacing.sm),
        _notifRow('Push en este dispositivo', 'Señales nuevas y operaciones ejecutadas', controller.notificationsWeb, controller.setNotificationsWeb),
        _notifRow('Notificaciones móviles', 'Alertas push en tu teléfono', controller.notificationsMobile, controller.setNotificationsMobile),
        _notifRow('Telegram', 'Señales con botones para operar o descartar', controller.notificationsTelegram, controller.setNotificationsTelegram),
        const SizedBox(height: AppSpacing.md),
        const Callout(message: 'Las alertas críticas (posición sin protección) te llegan siempre por Telegram y push.'),
      ],
    ),
  );
}

Widget _notifRow(String title, String desc, bool value, ValueChanged<bool> onChanged) {
  return Container(
    padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
    decoration: const BoxDecoration(border: Border(top: BorderSide(color: DsColors.divider))),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: AppTextStyles.body.copyWith(color: DsColors.textPrimary)),
              const SizedBox(height: AppSpacing.xs),
              Text(desc, style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary)),
            ],
          ),
        ),
        AppSwitch(value: value, onChanged: onChanged),
      ],
    ),
  );
}

Widget buildRsaKeysSection(SettingsController controller, {required VoidCallback onGenerate, required VoidCallback onCopy}) {
  return AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Llave Ed25519', style: AppTextStyles.cardTitle.copyWith(color: DsColors.textPrimary)),
        const SizedBox(height: AppSpacing.xs),
        Text(
          'Generá un par de llaves para autenticarte con Binance sin exponer un secreto compartido. Pegá la llave pública en Binance.',
          style: AppTextStyles.caption.copyWith(color: DsColors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.md),
        SecondaryButton(label: controller.isGeneratingKeys ? 'Generando...' : 'Generar llave pública', onPressed: controller.isGeneratingKeys ? null : onGenerate),
        if (controller.rsaPublicKey != null) ...[
          const SizedBox(height: AppSpacing.md),
          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(color: DsColors.inputBackground, borderRadius: BorderRadius.circular(10)),
            child: Row(
              children: [
                Expanded(child: SelectableText(controller.rsaPublicKey!, style: AppTextStyles.numXS.copyWith(color: DsColors.textPrimary))),
                IconButton(icon: const Icon(Icons.copy, size: 16, color: DsColors.textSecondary), onPressed: onCopy),
              ],
            ),
          ),
        ],
      ],
    ),
  );
}

Widget buildSaveBar(SettingsController controller, {required VoidCallback onDiscard, required VoidCallback onSave}) {
  if (!controller.hasUnsavedChanges) return const SizedBox.shrink();
  return Container(
    padding: const EdgeInsets.symmetric(vertical: AppSpacing.md, horizontal: AppSpacing.lg),
    decoration: const BoxDecoration(color: DsColors.surface, border: Border(top: BorderSide(color: DsColors.border))),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text('Tenés cambios sin guardar', style: AppTextStyles.bodySmall.copyWith(color: DsColors.textSecondary)),
        Row(
          children: [
            SecondaryButton(label: 'Descartar cambios', onPressed: onDiscard),
            const SizedBox(width: AppSpacing.md),
            PrimaryButton(label: controller.isSaving ? 'Guardando...' : 'Guardar cambios', onPressed: controller.isSaving ? null : onSave),
          ],
        ),
      ],
    ),
  );
}
