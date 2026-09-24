import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';
import 'dart:convert';

class ApiClient {
  static const String baseUrl = 'https://d283s0b41l.execute-api.ca-central-1.amazonaws.com';

  static Future<Map<String, String>> _getHeaders(Map<String, String>? extraHeaders) async {
    final user = FirebaseAuth.instance.currentUser;
    final headers = <String, String>{
      'Content-Type': 'application/json',
    };
    
    if (user != null) {
      headers['Authorization'] = 'Bearer ${user.uid}';
    }
    
    if (extraHeaders != null) {
      headers.addAll(extraHeaders);
    }
    
    return headers;
  }

  static Future<http.Response> get(String endpoint, {Map<String, String>? headers}) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    return await http.get(uri, headers: await _getHeaders(headers));
  }

  static Future<http.Response> post(String endpoint, {Map<String, dynamic>? body, Map<String, String>? headers}) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    return await http.post(
      uri,
      headers: await _getHeaders(headers),
      body: body != null ? jsonEncode(body) : null,
    );
  }

  static Future<http.Response> put(String endpoint, {Map<String, dynamic>? body, Map<String, String>? headers}) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    return await http.put(
      uri,
      headers: await _getHeaders(headers),
      body: body != null ? jsonEncode(body) : null,
    );
  }
}
