/** SGR (Select Graphic Rendition) text attributes. */
export interface CellAttrs {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  reverse: boolean;
  fg: number | null; // SGR color index (0-255) or null for default
  bg: number | null;
}

/** A single terminal cell. */
export interface Cell {
  char: string;  // single character or empty string
  attrs: CellAttrs;
}

/** Snapshot of terminal state used for test assertions. */
export interface TerminalState {
  rows: number;
  cols: number;
  cursorRow: number;
  cursorCol: number;
  cells: Cell[][];
}

export function defaultAttrs(): CellAttrs {
  return { bold: false, italic: false, underline: false, reverse: false, fg: null, bg: null };
}

export function defaultCell(): Cell {
  return { char: "", attrs: defaultAttrs() };
}
