import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/utils/dashboard_mappers.dart';
import '../../core/utils/strategy_name.dart';
import '../../core/utils/symbol_formatter.dart';
import '../../providers/dashboard_provider.dart';
import '../../widgets/widgets.dart';

/// Arma un `PositionCard` a partir de la fila cruda de `positions[]` que
/// manda `GET /api/dashboard` (mobile y desktop comparten este mapeo).
Widget buildPositionCard(BuildContext context, dynamic p) {
  final entry = double.tryParse(p['entryPrice']?.toString() ?? '') ?? 0;
  final lastPrice = double.tryParse(p['markPrice']?.toString() ?? '') ?? entry;
  final stop = double.tryParse(p['stopLoss']?.toString() ?? '') ?? entry;
  final target = double.tryParse(p['takeProfit']?.toString() ?? '') ?? entry;
  return PositionCard(
    symbol: fmtSymbol(p['symbol']),
    isLong: (p['side']?.toString().toLowerCase() ?? 'long') == 'long',
    strategy: strategyName(p['strategy']?.toString()),
    leverage: p['leverage'] is int ? p['leverage'] : int.tryParse(p['leverage']?.toString() ?? ''),
    marginMode: p['marginMode']?.toString(),
    entry: entry,
    lastPrice: lastPrice,
    stop: stop,
    target: target,
    pnlUsd: (p['unrealizedPnl'] as num?)?.toDouble(),
    pnlPct: (p['percentage'] as num?)?.toDouble(),
    onTap: () => context.go('/dashboard/trade/${(p["symbol"]?.toString() ?? "UNKNOWN").replaceAll("/", "-")}', extra: p),
  );
}

/// Arma un `SignalCard` a partir de la fila cruda de `pendingSignals[]`.
Widget buildSignalCard(BuildContext context, DashboardProvider provider, dynamic s) {
  final entry = double.tryParse(s['entry']?.toString() ?? '') ?? 0;
  final stop = double.tryParse(s['stopLoss']?.toString() ?? '') ?? entry;
  final target = double.tryParse(s['takeProfit']?.toString() ?? '') ?? entry;
  final currentPrice = (s['currentPrice'] as num?)?.toDouble();
  final evaluatedAt = DateTime.tryParse(s['evaluatedAt']?.toString() ?? '');
  final expiry = evaluatedAt != null ? computeSignalExpiry(evaluatedAt) : const SignalExpiry(label: '—', soon: false, expired: false);
  final id = s['id'];
  final insufficientMargin = provider.marginWarning?['insufficient'] == true;

  return SignalCard(
    symbol: fmtSymbol(s['symbol']),
    isLong: isLongDirection(s['direction']),
    strategy: strategyName(s['strategy']?.toString() ?? s['regime']?.toString()),
    expiresLabel: expiry.label,
    expiresSoon: expiry.soon,
    entry: entry,
    stop: stop,
    target: target,
    currentPrice: currentPrice,
    btcContext: s['btcRegime']?.toString() ?? '—',
    canTrade: !insufficientMargin,
    cannotTradeReason: insufficientMargin ? 'Sin margen disponible' : null,
    onDiscard: id == null
        ? null
        : () async {
            final result = await showDiscardConfirmDialog(context, symbol: fmtSymbol(s['symbol']));
            if (!result.confirmed) return;
            await provider.discardSignal(id is int ? id : int.tryParse(id.toString()) ?? -1, reason: result.reason);
          },
    onTrade: id == null ? null : () => context.push('/dashboard/signal/$id', extra: s),
  );
}
