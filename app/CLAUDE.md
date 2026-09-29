# CLAUDE.md (app Flutter)

Guía para Claude Code al trabajar en la app Flutter. Ver también el `CLAUDE.md` de la raíz.

## Comandos (correr desde `app/`)

```bash
flutter pub get
flutter run                       # dispositivo/emulador
flutter build web --release       # build web (se despliega con amplify.yml en AWS Amplify)
flutter test
```

## Arquitectura (`app/lib/`)

Firebase Auth (Google sign-in + biometría) → ID token de Firebase como `Bearer` (`getIdToken()`, nunca `user.uid`) → `AppApi`, que lo verifica y exige que el uid esté en su lista de permitidos. Las pantallas se dividen en variantes responsivas `mobile_*`/`desktop_*` detrás de `responsive_layout.dart`. `core/network/api_client.dart` centraliza las llamadas a la API (todas deben pasar por ahí, sin `http` directo) y reintenta una vez con un token nuevo ante un 401; `core/utils/price_formatter.dart` (`fmtPrice`) maneja la precisión decimal dinámica que los commits recientes arreglaron repetidamente: **usarlo para mostrar cualquier precio, nunca hardcodear decimales**.
