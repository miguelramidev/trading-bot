def update_roadmap():
    with open('ROADMAP.md', 'r') as f:
        content = f.read()

    # The block we want to replace starts with "## 12. Plataforma SaaS Visual"
    
    new_block = """## 12. Plataforma SaaS Visual (Monorepo Flutter) - [En Progreso]
* [x] **Arquitectura Monorepo Iniciada:** Backend (Hono/TypeScript) y Frontend (Flutter) coexistiendo en la misma infraestructura.
* [x] **Conceptualización de Diseño (UI/UX):** Definidos los Prompts visuales de estilo "Premium Glassmorphism" y "Dark Mode Institucional" para:
    - [x] 1. Pantalla de Login Minimalista
    - [x] 2. Dashboard Resumen (Balance, PnL, Órdenes Rápidas)
    - [x] 3. Detalle y Aprobación de Trade (Vista de 3 Gráficos: 15m, 4H, 1D BTC)
    - [x] 4. Detalle Técnico de Trade Activo (Puros números Monoespaciados)
    - [x] 5. Historial Contable Estático
    - [x] 6. Panel de Ajustes Algorítmicos (Switches y API Config)
* [x] **Sistema de Autenticación & Seguridad (Flutter):**
    - [x] Integración de Firebase Auth & Google Sign-In.
    - [x] Desarrollo de `LoginScreen` ultra-responsivo (Mobile Glassmorphism & Web Split-Card).
    - [x] Implementación de Autenticación Biométrica Nativa (`local_auth`).
* [x] **Arquitectura Multi-Tenant (B2B SaaS):**
    - [x] Migración del esquema Neon DB para soportar `user_config` vinculado a `firebase_uid`.
    - [x] Encriptación asimétrica militar (RSA/Ed25519): Generación de llaves públicas/privadas desde el frontend en Dart y descifrado seguro en AWS para la inyección de API Keys de Binance en CCXT sin filtración.
    - [x] Conversión del Bot y Cron Jobs de un modelo "Global Singleton" a un bucle "Per-User" que evalúa saldo y opera de forma independiente por cuenta.
* [x] **Dashboard Interactivo en Vivo:**
    - [x] Sustitución de *Mock Data* por endpoints reales (`/api/dashboard`).
    - [x] Creación de `daily_reports` para mapear los historiales de capital por usuario y trazarlos usando `fl_chart` (Gráfico de rendimiento de capital a 30 días).
    - [x] Formateo condicional avanzado (Textos Rojos/Verdes dependiendo de PnL y escape estricto de variables en Dart).
    - [x] Adaptación Dual (Desktop & Mobile) sincronizada mediante botones manuales de Refresh para ahorrar ancho de banda de Websockets.
* [ ] **Módulo de Señales y Trade Execution:** Completar la pantalla visual de aprobación (`/api/trades` y push notifications visuales en Flutter)."""

    import re
    # We replace from "## 12. Plataforma SaaS Visual" to the end of the file
    content = re.sub(r'## 12\. Plataforma SaaS Visual \(Monorepo Flutter\) - \[En Progreso\].*', new_block, content, flags=re.DOTALL)

    with open('ROADMAP.md', 'w') as f:
        f.write(content)

update_roadmap()
