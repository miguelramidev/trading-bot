import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';
import 'dart:convert';

class ApiClient {
  static const String baseUrl = 'https://d283s0b41l.execute-api.ca-central-1.amazonaws.com';

  // El backend verifica el ID token de Firebase. getIdToken() devuelve el token en caché y lo renueva
  // solo cuando está por vencer; con forceRefresh se pide uno nuevo al servidor de Firebase.
  static Future<Map<String, String>> _getHeaders(Map<String, String>? extraHeaders, {bool forceRefresh = false}) async {
    final user = FirebaseAuth.instance.currentUser;
    final headers = <String, String>{
      'Content-Type': 'application/json',
    };

    if (user != null) {
      final token = await user.getIdToken(forceRefresh);
      if (token != null) {
        headers['Authorization'] = 'Bearer $token';
      }
    }

    if (extraHeaders != null) {
      headers.addAll(extraHeaders);
    }

    return headers;
  }

  // Envía la request; si el backend responde 401 (token vencido o revocado; la request no se
  // ejecutó porque el middleware de auth corre antes de cualquier lógica de negocio) reintenta
  // una sola vez con un token nuevo. `allowRetry: false` lo desactiva para operaciones que NO son
  // idempotentes (ej. ejecutar una señal): un reintento automático de un POST que escribe plata
  // real nunca debe depender de que el 401 siga significando "no se ejecutó nada" para siempre.
  static Future<http.Response> _send(
    Future<http.Response> Function(Map<String, String> headers) request,
    Map<String, String>? extraHeaders, {
    bool allowRetry = true,
  }) async {
    final response = await request(await _getHeaders(extraHeaders));
    if (!allowRetry || response.statusCode != 401) return response;
    return await request(await _getHeaders(extraHeaders, forceRefresh: true));
  }

  static Future<http.Response> get(String endpoint, {Map<String, String>? headers}) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    return await _send((h) => http.get(uri, headers: h), headers);
  }

  static Future<http.Response> post(
    String endpoint, {
    Map<String, dynamic>? body,
    Map<String, String>? headers,
    bool allowRetry = true,
  }) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    return await _send(
      (h) => http.post(uri, headers: h, body: body != null ? jsonEncode(body) : null),
      headers,
      allowRetry: allowRetry,
    );
  }

  static Future<http.Response> put(String endpoint, {Map<String, dynamic>? body, Map<String, String>? headers}) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    return await _send(
      (h) => http.put(uri, headers: h, body: body != null ? jsonEncode(body) : null),
      headers,
    );
  }

  static Future<http.Response> patch(String endpoint, Map<String, dynamic> body, {Map<String, String>? headers}) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    return await _send((h) => http.patch(uri, headers: h, body: jsonEncode(body)), headers);
  }
}
