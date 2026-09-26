import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../../core/network/api_client.dart';

import 'package:toastification/toastification.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'dart:convert';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../dashboard_screen.dart';
import 'settings_screen.dart';
import '../../services/auth_service.dart';

class MobileSettings extends StatefulWidget {
  const MobileSettings({super.key});

  @override
  State<MobileSettings> createState() => _MobileSettingsState();
}

class _MobileSettingsState extends State<MobileSettings> {
  final _apiKeyController = TextEditingController();
  final _amountController = TextEditingController(text: '25.00');
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
          alignment: Alignment.topCenter,
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
        alignment: Alignment.topCenter,
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
          alignment: Alignment.topCenter,
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
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: _buildAppBar(context),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Configuración de Motor', style: TextStyle(color: AppColors.textPrimary, fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text('PARÁMETROS DE EJECUCIÓN L2 & GESTIÓN DE RIESGO', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
            const SizedBox(height: 24),
            
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Interruptor Principal (Bot ON/OFF)', style: TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.bold)),
                            SizedBox(height: 4),
                            Text('SISTEMA ACTIVO / EN LÍNEA', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                          ],
                        ),
                      ),
                      Switch(value: _isBotActive, activeColor: AppColors.winGreen, onChanged: (v) async {
                        setState(() => _isBotActive = v);
                        await ApiClient.patch('/api/users/bot-status', {'isPaused': !v});
                      }),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.shield_outlined, color: AppColors.winGreen, size: 16),
                      SizedBox(width: 8),
                      Expanded(child: Text('Ejecución automatizada de señales verificadas bajo protocolo FIX v4.4', style: TextStyle(color: AppColors.textSecondary, fontSize: 12))),
                    ],
                  )
                ],
              ),
            ),
            
            const SizedBox(height: 24),
            _buildSectionHeader(Icons.account_balance_wallet, 'GESTIÓN DE CAPITAL Y RIESGO'),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _fullWidthInput('Monto Fijo por Operación', '\$', 'USDT', _amountController),
                  const SizedBox(height: 16),
                  _fullWidthInput('Operaciones Simultáneas', '', 'Operaciones', _OperacionesController),
                  const SizedBox(height: 24),
                  const Text('RANGO DE APALANCAMIENTO', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(child: _fullWidthInput('Mínimo', '', 'x', _leverageMinController)),
                      const SizedBox(width: 12),
                      Expanded(child: _fullWidthInput('Máximo', '', 'x', _leverageMaxController)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text('El bot operará con el mínimo y escalará hasta el máximo si Binance exige mayor Notional.', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                ],
              ),
            ),

            const SizedBox(height: 24),
            _buildSectionHeader(Icons.memory, 'MÓDULOS ALGORÍTMICOS ACTIVOS'),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
              child: Column(
                children: [
                  _switchRow('Estrategia MACD', 'Divergencias y cruces de momentum en 15m/1h', _isMacdActive, (v) => setState(() => _isMacdActive = v)),
                  const Divider(color: AppColors.border, height: 24),
                  _switchRow('Estrategia de Rupturas Falsas', 'Absorción de liquidez institucional en roturas', _isFakeoutActive, (v) => setState(() => _isFakeoutActive = v)),
                  const Divider(color: AppColors.border, height: 24),
                  _switchRow('Filtro Inversión Macro', 'Sincronización con tendencia macro 1D BTC', _isMacroActive, (v) => setState(() => _isMacroActive = v)),
                  const Divider(color: AppColors.border, height: 24),
                  _switchRow('Escudo Tasa de Financiación', 'Descarte de Operaciones con arbitraje negativo >0.01%', _isFundingActive, (v) => setState(() => _isFundingActive = v)),
                ],
              ),
            ),

            const SizedBox(height: 24),
            _buildSectionHeader(Icons.vpn_key, 'CREDENCIALES API & TELEMETRÍA'),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _switchRow('Notificaciones Web', 'Toast mientras la app está abierta', _notificationsWeb, (v) {
                    setState(() => _notificationsWeb = v);
                    if (v) AuthService().initFCM();
                  }),
                  const Divider(color: AppColors.border, height: 16),
                  _switchRow('Notificaciones Móviles (Push)', 'Alertas en tu teléfono cuando hay trades', _notificationsMobile, (v) {
                    setState(() => _notificationsMobile = v);
                    if (v) AuthService().initFCM();
                  }),
                  const Divider(color: AppColors.border, height: 16),
                    _switchRow('Notificaciones Telegram', 'Alertas por bot de Telegram', _notificationsTelegram, (v) {
                      setState(() => _notificationsTelegram = v);
                    }),
                    const Divider(color: AppColors.border, height: 32),
                  
                  const Text('GENERADOR DE LLAVES Ed25519', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: (_isSaving || _isGeneratingKeys) ? null : _generateRSA,
                      icon: const Icon(Icons.key, color: AppColors.winGreen, size: 16),
                      label: _isGeneratingKeys ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.winGreen)) : const Text('Generar Llave Pública', style: TextStyle(color: AppColors.winGreen)),
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
                        Expanded(child: SelectableText(_rsaPublicKey ?? 'Presiona el botón para generar...', style: AppTheme.monoStyle.copyWith(color: _rsaPublicKey != null ? AppColors.textPrimary : AppColors.textSecondary, fontSize: 10))),
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
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text('CLAVE API DE BINANCE', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
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
                  const SizedBox(height: 24),
                ],
              ),
            ),
            
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.winGreen, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                onPressed: (_isSaving || _isGeneratingKeys) ? null : _saveConfig,
                icon: _isGeneratingKeys ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.black)) : const Icon(Icons.save, color: Colors.black),
                label: const Text('Guardar configuración', style: TextStyle(color: Colors.black, fontSize: 16, fontWeight: FontWeight.bold)),
              ),
            ),
            const SizedBox(height: 12),
            const Center(child: Text('SINCRONIZACIÓN EN CALIENTE SIN REINICIO DE MEMORIA', style: TextStyle(color: AppColors.textSecondary, fontSize: 9, letterSpacing: 1))),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  AppBar _buildAppBar(BuildContext context) {
    return AppBar(
      backgroundColor: AppColors.background,
      elevation: 0,
      titleSpacing: 0,
      leading: const Icon(Icons.shield_outlined, color: AppColors.winGreen),
      title: const Text('MacroQuant', style: TextStyle(color: AppColors.textPrimary, fontSize: 18)),
      actions: [
        IconButton(icon: const Icon(Icons.help_outline, color: AppColors.textSecondary, size: 20), onPressed: () {}),
      ],
    );
  }

  Widget _buildSectionHeader(IconData icon, String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, left: 4),
      child: Row(
        children: [
          Icon(icon, color: AppColors.textSecondary, size: 16),
          const SizedBox(width: 8),
          Text(title, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1)),
        ],
      ),
    );
  }

  Widget _fullWidthInput(String label, String prefix, String suffix, TextEditingController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: const TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
        const SizedBox(height: 8),
        SizedBox(
          height: 48,
          child: TextField(
            controller: controller,
            keyboardType: TextInputType.number,
            style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontWeight: FontWeight.bold),
            decoration: InputDecoration(
              prefixText: prefix.isNotEmpty ? '$prefix ' : '',
              suffixText: suffix.isNotEmpty ? ' $suffix' : '',
              prefixStyle: const TextStyle(color: AppColors.textSecondary),
              suffixStyle: const TextStyle(color: AppColors.textSecondary),
              filled: true,
              fillColor: AppColors.background,
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
              enabledBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
              focusedBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.winGreen), borderRadius: BorderRadius.circular(8)),
            ),
          ),
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
        Switch(value: value, activeColor: AppColors.winGreen, onChanged: onChanged)
      ],
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    return BottomNavigationBar(
      backgroundColor: AppColors.background,
      selectedItemColor: AppColors.winGreen,
      unselectedItemColor: AppColors.textSecondary,
      currentIndex: 2, // Ajustes
      onTap: (index) {
        if (index == 0) {
          Navigator.pushReplacementNamed(context, '/Inicio');
        } else if (index == 2) {
          Navigator.pushReplacementNamed(context, '/settings');
        }
      },
      items: const [
        BottomNavigationBarItem(icon: Icon(Icons.grid_view), label: 'Inicio'),
        BottomNavigationBarItem(icon: Icon(Icons.show_chart), label: 'Historial'),
        BottomNavigationBarItem(icon: Icon(Icons.tune), label: 'Ajustes'),
      ],
    );
  }
}


