# Plan de Implementación: Notificaciones Push (Web & Android)

Implementar notificaciones Push reales a través de Firebase Cloud Messaging (FCM) requiere orquestar 3 pilares: Firebase, el Backend (SST) y el Frontend (Flutter). 

## User Review Required

> [!IMPORTANT]
> **Configuración Manual Requerida en Firebase:**
> Para que esto funcione, necesitarás acceder a tu consola de Firebase y generar ciertas credenciales (VAPID Key para Web, `google-services.json` para Android, y el Service Account JSON para el Backend). Te guiaré paso a paso cuando lleguemos ahí.

## Proposed Changes

### 1. Base de Datos (Drizzle)
- Modificaremos `src/db/schema.ts` para agregar la columna `fcmToken` en la tabla `user_config`. Esto permitirá que el backend sepa a qué dispositivo enviarle la alerta.

### 2. Backend (Node.js & SST)
- Instalaremos `firebase-admin` en la carpeta raíz.
- Crearemos un nuevo endpoint seguro `/api/fcm-token` para que la app guarde su token al iniciar sesión.
- Inyectaremos alertas Push nativas en los Cronjobs (`analyze.ts`) y Webhooks (`webhook.ts`). Ej: Cuando el bot identifique una señal o Binance ejecute una orden OCO.

### 3. Frontend (Flutter)
- Instalaremos el paquete `firebase_messaging`.
- En `main.dart`, configuraremos el canal para solicitar permisos nativos (en Android y Web).
- Configuraremos los "Background Handlers" (cuando la app está cerrada) y los "Foreground Handlers" (para que salga un Toast emergente si estás usando la app).
- Añadiremos el archivo `firebase-messaging-sw.js` en la carpeta `web` de Flutter.

## Verification Plan

### Automated Tests
- Validar el despliegue de las nuevas funciones Lambda en SST.
- Verificar compilación limpia en Flutter Web con soporte para el Service Worker.

### Manual Verification
- Enviar una alerta de prueba desde el Backend al dispositivo Android y Web.
- Desencadenar una alerta de Telegram para confirmar que viaja paralelamente como Push al celular.
