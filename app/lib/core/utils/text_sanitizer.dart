/// Algunas filas viejas de `reason` en la base quedaron con etiquetas HTML
/// crudas (`<b>...</b>`) y entidades sin decodificar, de una época en la que
/// el texto se armaba para Telegram. Flutter no interpreta HTML: hay que
/// limpiarlo antes de mostrarlo.
String stripHtml(String? raw) {
  if (raw == null) return '';
  return raw
      .replaceAll(RegExp(r'<[^>]*>'), '')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>');
}
