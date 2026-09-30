import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/widgets/status_pill.dart';

void main() {
  Future<void> pump(WidgetTester tester, StatusPillVariant variant, {String? label}) {
    return tester.pumpWidget(
      MaterialApp(home: Scaffold(body: StatusPill(variant, label: label))),
    );
  }

  const cases = <StatusPillVariant, String>{
    StatusPillVariant.objetivo: 'Objetivo tocado',
    StatusPillVariant.stop: 'Stop tocado',
    StatusPillVariant.enCurso: 'En curso',
    StatusPillVariant.pendiente: 'Pendiente',
    StatusPillVariant.descartada: 'Descartada',
    StatusPillVariant.expirada: 'Expirada',
    StatusPillVariant.activa: 'Activa',
    StatusPillVariant.desactivada: 'Desactivada',
    StatusPillVariant.retirada: 'Retirada',
  };

  for (final entry in cases.entries) {
    testWidgets('${entry.key} muestra "${entry.value}"', (tester) async {
      await pump(tester, entry.key);
      expect(find.text(entry.value), findsOneWidget);
    });
  }

  testWidgets('acepta texto compuesto sin perder la variante', (tester) async {
    await pump(tester, StatusPillVariant.pendiente, label: 'Pendiente · vence en 57 min');
    expect(find.text('Pendiente · vence en 57 min'), findsOneWidget);
    expect(find.text('Pendiente'), findsNothing);
  });
}
