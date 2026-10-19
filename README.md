# Juego: patrón Command

Juego interactivo en español para explorar el patrón de diseño Command. Mueve
el robot por el tablero, recoge las monedas y prueba el historial de comandos,
la opción de deshacer/rehacer, las bombas y los combos.

## Cómo jugar

Abre [`index.html`](./index.html) en un navegador moderno. No requiere
instalación, servidor ni dependencias de JavaScript.

- Usa las flechas o `W`, `A`, `S`, `D` para moverte.
- `Espacio`: dash.
- `B`: bomba.
- `C`: combo con los últimos tres comandos.
- `Z` / `Y`: deshacer / rehacer.
- Puedes hacer clic en los controles para reasignar las teclas.

## Publicación con GitHub Pages

El flujo de GitHub Actions de [`.github/workflows/pages.yml`](./.github/workflows/pages.yml)
publica el sitio al hacer push a `main`. En el repositorio, configura **Settings
> Pages > Build and deployment > Source** como **GitHub Actions**. La URL del
sitio aparecerá en la configuración de Pages y en la ejecución del flujo.

## Patrón Command

- **Command**: `MoveCommand`, `BombCommand` y `MacroCommand`.
- **Invoker**: `InputHandler`, que traduce teclas y conserva el historial.
- **Receiver**: `Game`, cuyo estado modifican los comandos.
- **Client**: la configuración que asocia acciones con comandos.
