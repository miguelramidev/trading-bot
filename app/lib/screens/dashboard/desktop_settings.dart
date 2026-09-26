import '../dashboard_screen.dart';
import 'settings_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../../core/network/api_client.dart';

import 'package:toastification/toastification.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'dart:convert';
import '../login_screen.dart';
import '../../services/auth_service.dart';

class DesktopSettings extends StatefulWidget {
  const DesktopSettings({super.key});

  @override
  State<DesktopSettings> createState() => _DesktopSettingsState();
}

class _DesktopSettingsState extends State<DesktopSettings> {
  final _apiKeyController = TextEditingController();
  final _apiSecretController = TextEditingController();
  final _amountController = TextEditingController(text: '25');
  final _OperacionesController = TextEditingController(text: '5');
  final _leverageMinController = TextEditingController(text: '1');
  final _leverageMaxController = TextEditingController(text: '2');
  bool _isSaving = false;
  bool _isGeneratingKeys = false;
  String? _rsaPublicKey;
  String? _rsaPrivateKey;

  bool _isBotActive = true;
  bool _isMacdActive = true;
  bool _isFakeoutActive = false;
  bool _isMacroActive = true;
  bool _isFundingActive = false;
  bool _notificationsWeb = true;
  bool _notificationsMobile = true;
  bool _notificationsTelegram = true;
  bool _isLoadingConfig = true;

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    try {
      final response = await ApiClient.get('/api/users/config');
      if (response.statusCode == 200) {
        final json = jsonDecode(response.body);
        if (json['success'] == true) {
          final data = json['data'];
          setState(() {
            _amountController.text = data['montoOperacion']?.toString() ?? '25';
            _OperacionesController.text = data['maxTrades']?.toString() ?? '5';
            _leverageMinController.text = data['leverageMin']?.toString() ?? '1';
            _leverageMaxController.text = data['leverageMax']?.toString() ?? '2';
            _notificationsWeb = data['notificationsWeb'] ?? true;
            _notificationsMobile = data['notificationsMobile'] ?? true;
            _rsaPublicKey = data['rsaPublicKey'];
          });
        }
      }
    } catch (e) {
      print('Error cargando configuración: $e');
    } finally {
      if (mounted) setState(() => _isLoadingConfig = false);
    }
  }


  Future<void> _generateRSA() async {
    setState(() => _isGeneratingKeys = true);
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;
      
      final response = await ApiClient.post('/api/users/keys/generate');
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() {
          _rsaPublicKey = data['publicKey'];
        });
        
        if (!mounted) return;
        toastification.show(
          context: context,
          type: ToastificationType.success,
          style: ToastificationStyle.fillColored,
          title: const Text('Llaves Generadas', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          description: const Text('La llave privada se guardó encriptada. Recuerda guardar los parámetros.', style: TextStyle(color: Colors.white70)),
          alignment: Alignment.topRight,
          autoCloseDuration: const Duration(seconds: 4),
          backgroundColor: AppColors.surface,
          primaryColor: AppColors.winGreen,
          icon: const Icon(Icons.check_circle, color: AppColors.winGreen),
          showProgressBar: false,
        );
      } else {
        throw Exception('Error del servidor: ${response.statusCode}');
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
      if (mounted) setState(() => _isGeneratingKeys = false);
    }
  }

  Future<void> _saveConfig() async {
    setState(() => _isSaving = true);
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    try {
      final levMin = int.tryParse(_leverageMinController.text) ?? 1;
      final levMax = int.tryParse(_leverageMaxController.text) ?? 2;

      if (levMin < 1 || levMax < 1 || levMin > levMax) {
        toastification.show(
          context: context,
          type: ToastificationType.error,
          style: ToastificationStyle.fillColored,
          title: const Text('Apalancamiento inválido', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          description: const Text('El mínimo debe ser ≥ 1 y el máximo debe ser ≥ al mínimo.', style: TextStyle(color: Colors.white70)),
          alignment: Alignment.topRight,
          autoCloseDuration: const Duration(seconds: 4),
          backgroundColor: AppColors.surface,
          primaryColor: AppColors.lossRed,
          icon: const Icon(Icons.error, color: AppColors.lossRed),
          showProgressBar: false,
        );
        setState(() => _isSaving = false);
        return;
      }

      final response = await http.put(
        Uri.parse('https://d283s0b41l.execute-api.ca-central-1.amazonaws.com/api/users/config'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${user.uid}',
        },
        body: jsonEncode({
          'binanceApiKey': _apiKeyController.text,
          'binanceApiSecret': _apiSecretController.text,
          'montoOperacion': int.tryParse(_amountController.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 25,
          'maxOperaciones': int.tryParse(_OperacionesController.text) ?? 5,
          'leverageMin': levMin,
          'leverageMax': levMax,
          'notificationsWeb': _notificationsWeb,
          'notificationsMobile': _notificationsMobile,
        'notificationsTelegram': _notificationsTelegram,
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
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Row(
        children: [
          Expanded(
            child: Column(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(32.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildHeroSection(context),
                        const SizedBox(height: 32),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(child: _buildRiskColumn()),
                            const SizedBox(width: 24),
                            Expanded(child: _buildModulesColumn()),
                            const SizedBox(width: 24),
                            Expanded(child: _buildSystemColumn()),
                          ],
                        ),
                        const SizedBox(height: 32),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            TextButton.icon(
                              onPressed: () {},
                              icon: const Icon(Icons.restore, color: AppColors.textSecondary),
                              label: const Text('Restablecer a Valores Seguros', style: TextStyle(color: AppColors.textSecondary)),
                            ),
                            const SizedBox(width: 24),
                            ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.winGreen,
                                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                              ),
                              onPressed: (_isSaving || _isGeneratingKeys) ? null : _saveConfig,
                              icon: _isSaving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.black, strokeWidth: 2)) : const Icon(Icons.save, color: Colors.black),
                              label: const Text('Guardar Todos los Cambios del Motor', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
                            )
                          ],
                        )
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // _buildSidebar removido, ya no es necesario

  // _buildTopBar removido al layout global MainScreen

  Widget _buildHeroSection(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(4)),
                  child: Text('CONTROL PRINCIPAL DEL SISTEMA', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
                ),
                const SizedBox(height: 12),
                Text('Estado del Motor Algorítmico (Master Switch Bot ON/OFF)', style: Theme.of(context).textTheme.displaySmall?.copyWith(fontSize: 20)),
                const SizedBox(height: 8),
                const Text('El bot está actualmente analizando flujos L2 y ejecutando señales aprobadas de forma autónoma con enrutamiento dark pool. La desactivación cancelará órdenes contingentes activas en menos de 5ms.', style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
              ],
            ),
          ),
          Switch(
            value: _isBotActive,
            activeColor: AppColors.winGreen,
            onChanged: (v) => setState(() => _isBotActive = v),
          )
        ],
      ),
    );
  }

  Widget _buildRiskColumn() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(8)), child: const Icon(Icons.shield_outlined, color: AppColors.textSecondary, size: 20)),
              const SizedBox(width: 12),
              const Expanded(child: Text('Riesgo y Capital', style: TextStyle(color: AppColors.textPrimary, fontSize: 18, fontWeight: FontWeight.bold))),
            ],
          ),
          const SizedBox(height: 24),
          _editableField('Monto por Operación (\$)', 'USDT', _amountController),
          const SizedBox(height: 16),
          _editableField('Límite de Operaciones Simultáneos', 'Operaciones', _OperacionesController),
          const SizedBox(height: 20),
          // Leverage Min / Max dual control
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Rango de Apalancamiento', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              const SizedBox(height: 4),
              const Text(
                'El bot operará con el mínimo. Si el Notional de Binance no se alcanza, escalará hasta el máximo.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 11),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(child: _leverageField('Mínimo', _leverageMinController)),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Column(
                      children: [
                        const SizedBox(height: 16),
                        Container(
                          width: 24,
                          height: 2,
                          decoration: BoxDecoration(
                            color: AppColors.textSecondary.withValues(alpha: 0.4),
                            borderRadius: BorderRadius.circular(1),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(child: _leverageField('Máximo', _leverageMaxController)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          _inputField('Stop Loss Global de Emergencia', '3.5% Drawdown Diario', isDanger: true),
        ],
      ),
    );
  }

  Widget _buildModulesColumn() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(8)), child: const Icon(Icons.memory, color: AppColors.textSecondary, size: 20)),
              const SizedBox(width: 12),
              const Expanded(child: Text('Módulos Algorítmicos', style: TextStyle(color: AppColors.textPrimary, fontSize: 18, fontWeight: FontWeight.bold))),
            ],
          ),
          const SizedBox(height: 24),
          _switchRow('MACD Zero-Cross', 'Divergencias y cruces de momentum en 15m y 1h', _isMacdActive, (v) => setState(() => _isMacdActive = v)),
          const Divider(color: AppColors.border, height: 16),
          _switchRow('Liquidity Sweep (Fakeouts)', 'Detección de absorción institucional y caza de liquidez en soporte/resistencia', _isFakeoutActive, (v) => setState(() => _isFakeoutActive = v)),
          const Divider(color: AppColors.border, height: 16),
          _switchRow('Macro Inversion Filter', 'Filtro de alineación con régimen de volatilidad y tendencia diaria de BTC/ETH', _isMacroActive, (v) => setState(() => _isMacroActive = v)),
          const Divider(color: AppColors.border, height: 16),
          _switchRow('Funding Rate Shield', 'Descarte automático de posiciones con coste de acarreo o arbitraje negativo >0.01%', _isFundingActive, (v) => setState(() => _isFundingActive = v)),
        ],
      ),
    );
  }

  Widget _buildSystemColumn() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(8)), child: const Icon(Icons.vpn_key_outlined, color: AppColors.textSecondary, size: 20)),
              const SizedBox(width: 12),
              const Expanded(child: Text('Sistema y Conectividad', style: TextStyle(color: AppColors.textPrimary, fontSize: 18, fontWeight: FontWeight.bold))),
            ],
          ),
          const SizedBox(height: 24),
          _switchRow('Notificaciones Web / Escritorio', 'Recibir notificaciones flotantes (Toast) mientras la app está abierta', _notificationsWeb, (v) {
            setState(() => _notificationsWeb = v);
            if (v) AuthService().initFCM();
          }),
          const Divider(color: AppColors.border, height: 24),
          _switchRow('Notificaciones Móviles (Push)', 'Recibir alertas push en tu dispositivo móvil cuando el bot opere o detecte una señal', _notificationsMobile, (v) {
            setState(() => _notificationsMobile = v);
            if (v) AuthService().initFCM();
          }),
          const Divider(color: AppColors.border, height: 16),
                    _switchRow('Notificaciones Telegram', 'Alertas por bot de Telegram', _notificationsTelegram, (v) {
                      setState(() => _notificationsTelegram = v);
                    }),
                    const Divider(color: AppColors.border, height: 32),
          
          const Text('Generador de Llaves Ed25519 (Bypass IP Restriction)', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: (_isSaving || _isGeneratingKeys) ? null : _generateRSA,
            icon: const Icon(Icons.key, color: AppColors.winGreen, size: 16),
            label: _isGeneratingKeys ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.winGreen)) : const Text('Generar Llave Pública para Binance', style: TextStyle(color: AppColors.winGreen)),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: AppColors.winGreen),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
          ),
          const SizedBox(height: 16),
          const Text('Llave Pública (Cópiala y pégala en Binance)', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(8), border: Border.all(color: AppColors.border)),
            child: Row(
              children: [
                Expanded(child: SelectableText(_rsaPublicKey ?? 'Presiona el botón para generar...', style: AppTheme.monoStyle.copyWith(color: _rsaPublicKey != null ? AppColors.textPrimary : AppColors.textSecondary, fontSize: 10))),
                IconButton(
                  icon: const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),
                  onPressed: _rsaPublicKey != null ? () {
                    Clipboard.setData(ClipboardData(text: _rsaPublicKey!));
                    toastification.show(
                      context: context,
                      type: ToastificationType.success,
                      style: ToastificationStyle.fillColored,
                      title: const Text('Copiado', style: TextStyle(color: Colors.white)),
                      description: const Text('Llave pública copiada al portapapeles', style: TextStyle(color: Colors.white70)),
                      alignment: Alignment.topRight,
                      autoCloseDuration: const Duration(seconds: 2),
                      backgroundColor: AppColors.surface,
                      primaryColor: AppColors.winGreen,
                      icon: const Icon(Icons.check, color: AppColors.winGreen),
                      showProgressBar: false,
                    );
                  } : null,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Text('CLAVE API DE BINANCE', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          const SizedBox(height: 8),
          TextField(
            controller: _apiKeyController,
            obscureText: true,
            style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 12),
            decoration: InputDecoration(
              hintText: 'Coloca aqui el api key dado por binance',
              hintStyle: TextStyle(color: AppColors.textSecondary.withValues(alpha: 0.5)),
              filled: true,
              fillColor: AppColors.background,
              enabledBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
              focusedBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.winGreen), borderRadius: BorderRadius.circular(8)),
            ),
          ),
          const SizedBox(height: 16),

        ],
      ),
    );
  }

    Widget _editableField(String label, String suffix, TextEditingController controller, {bool isDanger = false}) {
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
  }

  Widget _inputField(String label, String value, {bool isDanger = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: isDanger ? AppColors.lossRed.withOpacity(0.5) : AppColors.border),
          ),
          child: Text(value, style: AppTheme.monoStyle.copyWith(color: isDanger ? AppColors.lossRed : AppColors.textPrimary)),
        ),
      ],
    );
  }

  Widget _switchRow(String title, String subtitle, bool value, ValueChanged<bool> onChanged) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold, fontSize: 14)),
              const SizedBox(height: 4),
              Text(subtitle, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
            ],
          ),
        ),
        const SizedBox(width: 16),
        Switch(
          value: value,
          activeColor: AppColors.winGreen,
          onChanged: onChanged,
        )
      ],
    );
  }

  Widget _leverageField(String label, TextEditingController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.bold),
          decoration: InputDecoration(
            filled: true,
            fillColor: AppColors.background,
            prefixIcon: const Padding(
              padding: EdgeInsets.only(left: 12, right: 4),
              child: Text('x', style: TextStyle(color: AppColors.textSecondary, fontSize: 16, fontWeight: FontWeight.bold)),
            ),
            prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
            enabledBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
            focusedBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.winGreen), borderRadius: BorderRadius.circular(8)),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          ),
        ),
      ],
    );
  }
}

