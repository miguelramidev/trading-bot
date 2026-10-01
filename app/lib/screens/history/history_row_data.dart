import '../../core/utils/strategy_name.dart';

/// Parsea una fila cruda de `trades[]` (`GET /api/history`) a valores
/// tipados, compartido entre la tabla de escritorio y la lista de celular.
class HistoryRowData {
  final int? id;
  final String symbol;
  final bool isLong;
  final String strategy;
  final String entryPrice;
  final String exitPrice;
  final String status;
  final double? pnl;
  final double? roi;
  final DateTime? date;
  final int? leverage;

  const HistoryRowData({
    required this.id,
    required this.symbol,
    required this.isLong,
    required this.strategy,
    required this.entryPrice,
    required this.exitPrice,
    required this.status,
    required this.pnl,
    required this.roi,
    required this.date,
    required this.leverage,
  });

  bool get isDiscarded => status == 'DESCARTADO';

  factory HistoryRowData.fromTrade(Map<String, dynamic> trade) {
    final rawId = trade['id'];
    return HistoryRowData(
      id: rawId is int ? rawId : int.tryParse(rawId?.toString() ?? ''),
      symbol: trade['symbol']?.toString() ?? '—',
      isLong: trade['direction']?.toString().toUpperCase() == 'LONG',
      strategy: strategyName(trade['strategy']?.toString()),
      entryPrice: trade['entryPrice']?.toString() ?? '—',
      exitPrice: trade['exitPrice']?.toString() ?? '—',
      status: trade['status']?.toString() ?? 'DESCARTADO',
      pnl: (trade['pnl'] as num?)?.toDouble(),
      roi: (trade['roi'] as num?)?.toDouble(),
      date: DateTime.tryParse(trade['date']?.toString() ?? ''),
      leverage: trade['leverage'] is int ? trade['leverage'] as int : int.tryParse(trade['leverage']?.toString() ?? ''),
    );
  }
}
