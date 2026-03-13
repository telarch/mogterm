# MogTerm

A virtual terminal emulator engine for browser-based rendering. MogTerm interprets terminal output (ANSI/VT100 escape sequences, control codes), maintains terminal state, and produces renderable output for a browser UI.

## Architecture

```
Raw bytes  -->  Parser  -->  Actions  -->  Terminal  -->  State  -->  Renderer  -->  DOM
```

### Components

- **Parser** (`src/parser.ts`): State machine that processes raw byte streams and emits structured actions (print, execute, CSI dispatch, ESC dispatch, OSC dispatch). Handles ANSI/VT100 escape sequences including CSI, OSC, and SGR.

- **Terminal** (`src/terminal.ts`): Maintains the terminal state machine including:
  - Cell grid (80x24 default, configurable)
  - Cursor position and visibility
  - Text attributes (bold, dim, italic, underline, inverse, strikethrough, 256-color fg/bg)
  - Terminal modes (auto-wrap, alternate buffer, application cursor keys)
  - Scroll region support
  - Save/restore cursor

- **Renderer** (`src/renderer.ts`): Converts terminal state into DOM elements for browser display. Renders cells as styled spans with proper color mapping for the full 256-color palette.

- **Types** (`src/types.ts`): Shared type definitions for cells, attributes, cursor state, and terminal state snapshots.

### Supported Escape Sequences

| Category | Sequences |
|----------|-----------|
| Cursor movement | CUU (A), CUD (B), CUF (C), CUB (D), CNL (E), CPL (F), CHA (G), CUP (H/f), VPA (d) |
| Erase | ED (J: 0/1/2/3), EL (K: 0/1/2) |
| Line operations | IL (L), DL (M), SU (S), SD (T) |
| Character operations | ICH (@), DCH (P), ECH (X) |
| SGR attributes | Reset (0), bold (1), dim (2), italic (3), underline (4), blink (5), inverse (7), hidden (8), strikethrough (9), fg colors (30-37, 38;5;n, 90-97), bg colors (40-47, 48;5;n, 100-107) |
| Private modes | DECCKM (?1), DECOM (?6), DECAWM (?7), DECTCEM (?25), Alt buffer (?1049), Bracketed paste (?2004) |
| OSC | Set title (0, 2) |
| ESC | Save cursor (7), Restore cursor (8), Index (D), Next Line (E), Reverse Index (M), Full Reset (c) |
| Scroll | DECSTBM (r) - set scroll region |

## Getting Started

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Run tests

```bash
npm test
```

### Run the demo

Open `demo/index.html` in a browser, or serve it:

```bash
npx serve demo
```

The demo page includes interactive buttons for color tests, cursor movement, text attributes, an ASCII banner, and a matrix rain animation. You can also feed raw text and escape sequences via the input area.

## API Usage

```typescript
import { Terminal, Renderer } from 'mogterm';

// Create a terminal instance
const terminal = new Terminal(80, 24);

// Feed data
terminal.write('Hello, \x1b[1;32mMogTerm\x1b[0m!\r\n');

// Read state
const state = terminal.getState();
console.log(state.cells[0][0].char); // 'H'
console.log(state.cursor); // { row: 1, col: 0, visible: true }

// Browser rendering
const renderer = new Renderer(document.getElementById('terminal'));
renderer.render(terminal.getState());
```
