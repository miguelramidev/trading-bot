import 'dart:convert';
import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/utils/capital_risk_validation.dart';

/// Estado y guardado de Configuración, compartido entre `mobile_settings.dart`
/// y `desktop_settings.dart`.
class SettingsController extends ChangeNotifier {
  SettingsController() {
    _load();
  }

  bool isLoading = true;
  bool isSaving = false;
  bool isGeneratingKeys = false;
  String? loadError;
  String? saveError;

  double montoOperacion = 25;
  int maxTrades = 5;
  int leverageMin = 1;
  int leverageMax = 2;

  final montoOperacionController = TextEditingController(text: '25.00');
  final maxTradesController = TextEditingController(text: '5');
  final leverageMinController = TextEditingController(text: '1');
  final leverageMaxController = TextEditingController(text: '2');
  bool notificationsWeb = true;
  bool notificationsMobile = true;
  bool notificationsTelegram = true;
  bool isBotActive = true;
  bool hasBinanceKeys = false;
  bool hasRsaKeys = false;
  String? rsaPublicKey;

  /// `null` si no hay keys, si Binance no respondió a tiempo (2s), o si la
  /// consulta falló — nunca un valor supuesto.
  Map<String, dynamic>? binanceKeyInfo;

  bool replacingKeys = false;
  String binanceApiKeyInput = '';
  String binanceApiSecretInput = '';

  Map<String, dynamic> _original = {};

  bool get hasUnsavedChanges {
    return montoOperacion != _original['montoOperacion'] ||
        maxTrades != _original['maxTrades'] ||
        leverageMin != _original['leverageMin'] ||
        leverageMax != _original['leverageMax'] ||
        notificationsWeb != _original['notificationsWeb'] ||
        notificationsMobile != _original['notificationsMobile'] ||
        notificationsTelegram != _original['notificationsTelegram'] ||
        binanceApiKeyInput.isNotEmpty ||
        binanceApiSecretInput.isNotEmpty;
  }

  String? get validationError => validateCapitalRisk(montoOperacion: montoOperacion, maxTrades: maxTrades, leverageMin: leverageMin, leverageMax: leverageMax);

  void setMontoOperacion(double v) {
    montoOperacion = v;
    notifyListeners();
  }

  void setMaxTrades(int v) {
    maxTrades = v;
    notifyListeners();
  }

  void setLeverageMin(int v) {
    leverageMin = v;
    notifyListeners();
  }

  void setLeverageMax(int v) {
    leverageMax = v;
    notifyListeners();
  }

  void setNotificationsWeb(bool v) {
    notificationsWeb = v;
    notifyListeners();
  }

  void setNotificationsMobile(bool v) {
    notificationsMobile = v;
    notifyListeners();
  }

  void setNotificationsTelegram(bool v) {
    notificationsTelegram = v;
    notifyListeners();
  }

  void setReplacingKeys(bool v) {
    replacingKeys = v;
    if (!v) {
      binanceApiKeyInput = '';
      binanceApiSecretInput = '';
    }
    notifyListeners();
  }

  void setBinanceApiKeyInput(String v) {
    binanceApiKeyInput = v;
    notifyListeners();
  }

  void setBinanceApiSecretInput(String v) {
    binanceApiSecretInput = v;
    notifyListeners();
  }

  Future<void> toggleBot(bool active) async {
    isBotActive = active;
    notifyListeners();
    try {
      await ApiClient.patch('/api/users/bot-status', {'isPaused': !active});
    } catch (e) {
      // El cron sigue leyendo isPaused de la base igual; si falla el PATCH,
      // la próxima carga de la pantalla va a mostrar el valor real.
    }
  }

  Future<void> reload() => _load();

  Future<void> _load() async {
    isLoading = true;
    notifyListeners();
    try {
      final res = await ApiClient.get('/api/users/config');
      if (res.statusCode == 200) {
        final json = jsonDecode(res.body);
        if (json['success'] == true) {
          final data = json['data'];
          montoOperacion = (data['montoOperacion'] as num?)?.toDouble() ?? 25;
          maxTrades = data['maxTrades'] ?? 5;
          leverageMin = data['leverageMin'] ?? 1;
          leverageMax = data['leverageMax'] ?? 2;
          montoOperacionController.text = montoOperacion.toStringAsFixed(2);
          maxTradesController.text = '$maxTrades';
          leverageMinController.text = '$leverageMin';
          leverageMaxController.text = '$leverageMax';
          notificationsWeb = data['notificationsWeb'] ?? true;
          notificationsMobile = data['notificationsMobile'] ?? true;
          notificationsTelegram = data['notificationsTelegram'] ?? true;
          isBotActive = !(data['isPaused'] ?? false);
          hasBinanceKeys = data['hasBinanceKeys'] ?? false;
          hasRsaKeys = data['hasRsaKeys'] ?? false;
          rsaPublicKey = data['rsaPublicKey'];
          binanceKeyInfo = data['binanceKeyInfo'] as Map<String, dynamic>?;

          _original = {
            'montoOperacion': montoOperacion,
            'maxTrades': maxTrades,
            'leverageMin': leverageMin,
            'leverageMax': leverageMax,
            'notificationsWeb': notificationsWeb,
            'notificationsMobile': notificationsMobile,
            'notificationsTelegram': notificationsTelegram,
          };
        }
      } else {
        loadError = 'No se pudo cargar la configuración.';
      }
    } catch (e) {
      loadError = 'No se pudo conectar con el servidor.';
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> generateRsaKeys() async {
    isGeneratingKeys = true;
    notifyListeners();
    try {
      final res = await ApiClient.post('/api/users/keys/generate');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        rsaPublicKey = data['publicKey'];
        hasRsaKeys = true;
        return true;
      }
      return false;
    } catch (e) {
      return false;
    } finally {
      isGeneratingKeys = false;
      notifyListeners();
    }
  }

  /// `true` si se guardó. Si la validación local falla, no manda el PUT.
  Future<bool> save() async {
    if (validationError != null) return false;

    isSaving = true;
    saveError = null;
    notifyListeners();
    try {
      final body = <String, dynamic>{
        'montoOperacion': montoOperacion,
        'maxTrades': maxTrades,
        'leverageMin': leverageMin,
        'leverageMax': leverageMax,
        'notificationsWeb': notificationsWeb,
        'notificationsMobile': notificationsMobile,
        'notificationsTelegram': notificationsTelegram,
        if (binanceApiKeyInput.isNotEmpty) 'binanceApiKey': binanceApiKeyInput,
        if (binanceApiSecretInput.isNotEmpty) 'binanceApiSecret': binanceApiSecretInput,
      };

      final res = await ApiClient.put('/api/users/config', body: body);
      if (res.statusCode == 200) {
        _original = {
          'montoOperacion': montoOperacion,
          'maxTrades': maxTrades,
          'leverageMin': leverageMin,
          'leverageMax': leverageMax,
          'notificationsWeb': notificationsWeb,
          'notificationsMobile': notificationsMobile,
          'notificationsTelegram': notificationsTelegram,
        };
        if (binanceApiKeyInput.isNotEmpty) hasBinanceKeys = true;
        binanceApiKeyInput = '';
        binanceApiSecretInput = '';
        replacingKeys = false;
        return true;
      }
      final data = jsonDecode(res.body);
      saveError = data['error']?.toString() ?? 'No se pudo guardar la configuración.';
      return false;
    } catch (e) {
      saveError = 'No se pudo conectar con el servidor.';
      return false;
    } finally {
      isSaving = false;
      notifyListeners();
    }
  }

  void discardChanges() {
    montoOperacion = (_original['montoOperacion'] as num).toDouble();
    maxTrades = _original['maxTrades'];
    leverageMin = _original['leverageMin'];
    leverageMax = _original['leverageMax'];
    montoOperacionController.text = montoOperacion.toStringAsFixed(2);
    maxTradesController.text = '$maxTrades';
    leverageMinController.text = '$leverageMin';
    leverageMaxController.text = '$leverageMax';
    notificationsWeb = _original['notificationsWeb'];
    notificationsMobile = _original['notificationsMobile'];
    notificationsTelegram = _original['notificationsTelegram'];
    binanceApiKeyInput = '';
    binanceApiSecretInput = '';
    replacingKeys = false;
    notifyListeners();
  }

  @override
  void dispose() {
    montoOperacionController.dispose();
    maxTradesController.dispose();
    leverageMinController.dispose();
    leverageMaxController.dispose();
    super.dispose();
  }
}
