/** Text attributes for a terminal cell. */
export interface CellAttributes {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  blink: boolean;
  inverse: boolean;
  hidden: boolean;
  strikethrough: boolean;
  fg: number; // 0-255 (0-7 normal, 8-15 bright, 16-255 extended), -1 = default
  bg: number; // same as fg
}

/** A single cell in the terminal grid. */
export interface Cell {
  char: string;
  attrs: CellAttributes;
}

/** Cursor state. */
export interface CursorState {
  row: number;
  col: number;
  visible: boolean;
}

/** Terminal modes. */
export interface TerminalModes {
  /** Application cursor keys (DECCKM). */
  applicationCursor: boolean;
  /** Origin mode (DECOM). */
  originMode: boolean;
  /** Auto-wrap mode (DECAWM). */
  autoWrap: boolean;
  /** Bracket paste mode. */
  bracketedPaste: boolean;
  /** Alternate screen buffer. */
  alternateBuffer: boolean;
}

/** Complete snapshot of terminal state for rendering. */
export interface TerminalState {
  rows: number;
  cols: number;
  cells: Cell[][];
  cursor: CursorState;
  title: string;
}

/** Create default cell attributes. */
export function defaultAttrs(): CellAttributes {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    blink: false,
    inverse: false,
    hidden: false,
    strikethrough: false,
    fg: -1,
    bg: -1,
  };
}

/** Create a blank cell. */
export function blankCell(attrs?: CellAttributes): Cell {
  return {
    char: ' ',
    attrs: attrs ? { ...attrs } : defaultAttrs(),
  };
}
