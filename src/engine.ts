import { Cell, CellAttrs, TerminalState, defaultAttrs, defaultCell } from "./types.js";

/**
 * MogTerm terminal emulation engine.
 *
 * Parses a subset of VT100/xterm escape sequences and maintains
 * an in-memory screen buffer with cursor position and text attributes.
 */
export class MogTermEngine {
  private rows: number;
  private cols: number;
  private cursorRow = 0;
  private cursorCol = 0;
  private attrs: CellAttrs = defaultAttrs();
  private grid: Cell[][];

  constructor(rows = 24, cols = 80) {
    this.rows = rows;
    this.cols = cols;
    this.grid = this.makeGrid();
  }

  // -- public API -----------------------------------------------------------

  /** Feed a raw byte string (may contain escape sequences) into the engine. */
  feed(data: string): void {
    let i = 0;
    while (i < data.length) {
      const ch = data[i];

      if (ch === "\x1b") {
        // Start of an escape sequence
        i = this.parseEscape(data, i);
      } else if (ch === "\n") {
        this.cursorCol = 0;
        this.linefeed();
        i++;
      } else if (ch === "\r") {
        this.cursorCol = 0;
        i++;
      } else if (ch === "\x08") {
        // Backspace
        if (this.cursorCol > 0) this.cursorCol--;
        i++;
      } else if (ch === "\t") {
        // Tab: advance to next 8-column tab stop
        const nextTab = Math.min((Math.floor(this.cursorCol / 8) + 1) * 8, this.cols - 1);
        this.cursorCol = nextTab;
        i++;
      } else {
        this.putChar(ch);
        i++;
      }
    }
  }

  /** Return a snapshot of the current terminal state. */
  getState(): TerminalState {
    return {
      rows: this.rows,
      cols: this.cols,
      cursorRow: this.cursorRow,
      cursorCol: this.cursorCol,
      cells: this.grid.map(row => row.map(cell => ({
        char: cell.char,
        attrs: { ...cell.attrs },
      }))),
    };
  }

  /** Reset the terminal to its initial state. */
  reset(): void {
    this.cursorRow = 0;
    this.cursorCol = 0;
    this.attrs = defaultAttrs();
    this.grid = this.makeGrid();
  }

  /** Extract a line of text from the screen (trimmed of trailing spaces). */
  getLineText(row: number): string {
    if (row < 0 || row >= this.rows) return "";
    const cells = this.grid[row];
    let text = "";
    for (const cell of cells) {
      text += cell.char || " ";
    }
    return text.replace(/\s+$/, "");
  }

  // -- private: character output --------------------------------------------

  private putChar(ch: string): void {
    if (this.cursorCol >= this.cols) {
      // Line wrap
      this.cursorCol = 0;
      this.linefeed();
    }
    this.grid[this.cursorRow][this.cursorCol] = {
      char: ch,
      attrs: { ...this.attrs },
    };
    this.cursorCol++;
  }

  private linefeed(): void {
    if (this.cursorRow < this.rows - 1) {
      this.cursorRow++;
    } else {
      // Scroll up
      this.grid.shift();
      this.grid.push(this.makeRow());
    }
  }

  // -- private: escape sequence parsing -------------------------------------

  /**
   * Parse an escape sequence starting at position i.
   * Returns the new index past the consumed sequence.
   */
  private parseEscape(data: string, i: number): number {
    // i points to ESC (\x1b)
    if (i + 1 >= data.length) return i + 1;

    const next = data[i + 1];

    if (next === "[") {
      // CSI sequence
      return this.parseCSI(data, i + 2);
    }

    // Unknown escape — skip ESC + next char
    return i + 2;
  }

  /**
   * Parse a CSI (Control Sequence Introducer) sequence.
   * data[start] is the first character after "ESC[".
   */
  private parseCSI(data: string, start: number): number {
    let i = start;
    let params = "";

    // Collect parameter bytes (digits, semicolons, question marks)
    while (i < data.length && this.isParamByte(data[i])) {
      params += data[i];
      i++;
    }

    if (i >= data.length) return i;

    const finalByte = data[i];
    i++; // consume final byte

    const paramList = this.parseParams(params);

    switch (finalByte) {
      case "A": this.cuu(paramList); break; // Cursor Up
      case "B": this.cud(paramList); break; // Cursor Down
      case "C": this.cuf(paramList); break; // Cursor Forward
      case "D": this.cub(paramList); break; // Cursor Back
      case "H": // Cursor Position (CUP)
      case "f": this.cup(paramList); break;
      case "J": this.ed(paramList); break;  // Erase in Display
      case "K": this.el(paramList); break;  // Erase in Line
      case "m": this.sgr(paramList); break; // SGR
      case "d": this.vpa(paramList); break; // Vertical Position Absolute
      case "G": this.cha(paramList); break; // Cursor Horizontal Absolute
      default:
        // Unknown CSI sequence — ignore
        break;
    }

    return i;
  }

  private isParamByte(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return (code >= 0x30 && code <= 0x3f); // 0-9, ;, <, =, >, ?
  }

  private parseParams(raw: string): number[] {
    if (raw === "") return [];
    return raw.split(";").map(s => (s === "" ? 0 : parseInt(s, 10)));
  }

  // -- CSI handlers ---------------------------------------------------------

  /** CUU – Cursor Up. */
  private cuu(params: number[]): void {
    const n = Math.max(params[0] || 1, 1);
    this.cursorRow = Math.max(this.cursorRow - n, 0);
  }

  /** CUD – Cursor Down. */
  private cud(params: number[]): void {
    const n = Math.max(params[0] || 1, 1);
    this.cursorRow = Math.min(this.cursorRow + n, this.rows - 1);
  }

  /** CUF – Cursor Forward. */
  private cuf(params: number[]): void {
    const n = Math.max(params[0] || 1, 1);
    this.cursorCol = Math.min(this.cursorCol + n, this.cols - 1);
  }

  /** CUB – Cursor Back. */
  private cub(params: number[]): void {
    const n = Math.max(params[0] || 1, 1);
    this.cursorCol = Math.max(this.cursorCol - n, 0);
  }

  /** CUP – Cursor Position. Parameters are 1-based. */
  private cup(params: number[]): void {
    const row = Math.max((params[0] || 1) - 1, 0);
    const col = Math.max((params[1] || 1) - 1, 0);
    this.cursorRow = Math.min(row, this.rows - 1);
    this.cursorCol = Math.min(col, this.cols - 1);
  }

  /** VPA – Vertical Position Absolute (1-based row). */
  private vpa(params: number[]): void {
    const row = Math.max((params[0] || 1) - 1, 0);
    this.cursorRow = Math.min(row, this.rows - 1);
  }

  /** CHA – Cursor Horizontal Absolute (1-based column). */
  private cha(params: number[]): void {
    const col = Math.max((params[0] || 1) - 1, 0);
    this.cursorCol = Math.min(col, this.cols - 1);
  }

  /** ED – Erase in Display. */
  private ed(params: number[]): void {
    const mode = params[0] || 0;
    if (mode === 0) {
      // Erase from cursor to end of screen
      this.clearRange(this.cursorRow, this.cursorCol, this.rows - 1, this.cols - 1);
    } else if (mode === 1) {
      // Erase from start of screen to cursor
      this.clearRange(0, 0, this.cursorRow, this.cursorCol);
    } else if (mode === 2) {
      // Erase entire screen
      this.clearRange(0, 0, this.rows - 1, this.cols - 1);
    }
  }

  /** EL – Erase in Line. */
  private el(params: number[]): void {
    const mode = params[0] || 0;
    if (mode === 0) {
      // Erase from cursor to end of line
      this.clearRange(this.cursorRow, this.cursorCol, this.cursorRow, this.cols - 1);
    } else if (mode === 1) {
      // Erase from start of line to cursor
      this.clearRange(this.cursorRow, 0, this.cursorRow, this.cursorCol);
    } else if (mode === 2) {
      // Erase entire line
      this.clearRange(this.cursorRow, 0, this.cursorRow, this.cols - 1);
    }
  }

  /** SGR – Select Graphic Rendition. */
  private sgr(params: number[]): void {
    if (params.length === 0) params = [0];

    let i = 0;
    while (i < params.length) {
      const p = params[i];

      if (p === 0) {
        this.attrs = defaultAttrs();
      } else if (p === 1) {
        this.attrs.bold = true;
      } else if (p === 3) {
        this.attrs.italic = true;
      } else if (p === 4) {
        this.attrs.underline = true;
      } else if (p === 7) {
        this.attrs.reverse = true;
      } else if (p === 22) {
        this.attrs.bold = false;
      } else if (p === 23) {
        this.attrs.italic = false;
      } else if (p === 24) {
        this.attrs.underline = false;
      } else if (p === 27) {
        this.attrs.reverse = false;
      } else if (p >= 30 && p <= 37) {
        this.attrs.fg = p - 30;
      } else if (p === 38) {
        // Extended foreground: 38;5;n
        if (i + 2 < params.length && params[i + 1] === 5) {
          this.attrs.fg = params[i + 2];
          i += 2;
        }
      } else if (p === 39) {
        this.attrs.fg = null;
      } else if (p >= 40 && p <= 47) {
        this.attrs.bg = p - 40;
      } else if (p === 48) {
        // Extended background: 48;5;n
        if (i + 2 < params.length && params[i + 1] === 5) {
          this.attrs.bg = params[i + 2];
          i += 2;
        }
      } else if (p === 49) {
        this.attrs.bg = null;
      } else if (p >= 90 && p <= 97) {
        // Bright foreground colors
        this.attrs.fg = p - 90 + 8;
      } else if (p >= 100 && p <= 107) {
        // Bright background colors
        this.attrs.bg = p - 100 + 8;
      }

      i++;
    }
  }

  // -- helpers --------------------------------------------------------------

  private clearRange(r1: number, c1: number, r2: number, c2: number): void {
    for (let r = r1; r <= r2 && r < this.rows; r++) {
      const startCol = r === r1 ? c1 : 0;
      const endCol = r === r2 ? c2 : this.cols - 1;
      for (let c = startCol; c <= endCol && c < this.cols; c++) {
        this.grid[r][c] = defaultCell();
      }
    }
  }

  private makeGrid(): Cell[][] {
    return Array.from({ length: this.rows }, () => this.makeRow());
  }

  private makeRow(): Cell[] {
    return Array.from({ length: this.cols }, () => defaultCell());
  }
}
