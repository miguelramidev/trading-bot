#!/bin/bash
# Chequea tipos con el TypeScript 7 real del proyecto después de cada edición.
input=$(cat)
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Solo archivos TypeScript del backend (la app Flutter no aplica)
[[ "$file" =~ \.(ts|tsx|mts|cts)$ ]] || exit 0
[[ "$file" == *"/app/"* ]] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0
if ! out=$(pnpm exec tsc --noEmit 2>&1); then
  echo "Errores de tipos (tsc, TS 7) después de editar $file:" >&2
  echo "$out" | head -40 >&2
  exit 2
fi
exit 0