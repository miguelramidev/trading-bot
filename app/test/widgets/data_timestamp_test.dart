import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/widgets/data_timestamp.dart';
import 'package:app/core/theme/ds_colors.dart';

void main() {
  testWidgets('muestra la hora formateada', (tester) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: DataTimestamp(dataTime: DateTime(2026, 9, 30, 14, 32)))));
    expect(find.text('Datos de las 14:32'), findsOneWidget);
  });

  testWidgets('a menos de 2 minutos: color normal (no atenuado)', (tester) async {
    final dataTime = DateTime(2026, 9, 30, 14, 32);
    final now = dataTime.add(const Duration(minutes: 1, seconds: 59));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: DataTimestamp(dataTime: dataTime, now: now))));
    final text = tester.widget<Text>(find.byType(Text));
    expect(text.style?.color, DsColors.textSecondary);
  });

  testWidgets('a más de 2 minutos: se atenúa', (tester) async {
    final dataTime = DateTime(2026, 9, 30, 14, 32);
    final now = dataTime.add(const Duration(minutes: 2, seconds: 1));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: DataTimestamp(dataTime: dataTime, now: now))));
    final text = tester.widget<Text>(find.byType(Text));
    expect(text.style?.color, DsColors.textTertiary);
  });

  testWidgets('sin dataTime: muestra — y no se atenúa', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: DataTimestamp(dataTime: null))));
    expect(find.text('—'), findsOneWidget);
  });
}
