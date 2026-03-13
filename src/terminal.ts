/**
 * Terminal state machine.
 *
 * Maintains the cell grid, cursor position, text attributes,
 * and terminal modes. Processes actions from the parser to
 * update terminal state.
 */

import { Parser, ActionType } from './parser.js';
import type { Action, CsiAction, OscAction } from './parser.js';
import {
  type Cell,
  type CellAttributes,
  type CursorState,
  type TerminalModes,
  type TerminalState,
  defaultAttrs,
  blankCell,
} from './types.js';

export class Terminal {
  readonly rows: number;
  readonly cols: number;

  private cells: Cell[][];
  private cursor: CursorState;
  private attrs: CellAttributes;
  private modes: TerminalModes;
  private title = '';
  private parser: Parser;

  /** Saved cursor state (for ESC 7 / ESC 8). */
  private savedCursor: CursorState | null = null;
  private savedAttrs: CellAttributes | null = null;

  /** Scroll region (top and bottom, inclusive, 0-indexed). */
  private scrollTop = 0;
  private scrollBottom: number;

  /** Alternate screen buffer storage. */
  private altCells: Cell[][] | null = null;
  private altCursor: CursorState | null = null;

  constructor(cols = 80, rows = 24) {
    this.rows = rows;
    this.cols = cols;
    this.scrollBottom = rows - 1;

    this.cells = this.createGrid();
    this.cursor = { row: 0, col: 0, visible: true };
    this.attrs = defaultAttrs();
    this.modes = {
      applicationCursor: false,
      originMode: false,
      autoWrap: true,
      bracketedPaste: false,
      alternateBuffer: false,
    };
    this.parser = new Parser();
  }

  /** Feed raw data into the terminal. This is the main write API. */
  write(data: string): void {
    this.parser.feed(data, (action) => this.handleAction(action));
  }

  /** Get a snapshot of the current terminal state for rendering. */
  getState(): TerminalState {
    return {
      rows: this.rows,
      cols: this.cols,
      cells: this.cells.map((row) => row.map((cell) => ({
        char: cell.char,
        attrs: { ...cell.attrs },
      }))),
      cursor: { ...this.cursor },
      title: this.title,
    };
  }

  /** Get a single cell (for efficient partial reads). */
  getCell(row: number, col: number): Cell | null {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    return this.cells[row][col];
  }

  /** Get the current cursor position. */
  getCursor(): CursorState {
    return { ...this.cursor };
  }

  /** Get the terminal title. */
  getTitle(): string {
    return this.title;
  }

  // --- Internal ---

  private createGrid(): Cell[][] {
    const grid: Cell[][] = [];
    for (let r = 0; r < this.rows; r++) {
      grid.push(this.createRow());
    }
    return grid;
  }

  private createRow(): Cell[] {
    const row: Cell[] = [];
    for (let c = 0; c < this.cols; c++) {
      row.push(blankCell());
    }
    return row;
  }

  private handleAction(action: Action): void {
    switch (action.type) {
      case ActionType.Print:
        this.printChar(action.char);
        break;
      case ActionType.Execute:
        this.executeControl(action.code);
        break;
      case ActionType.CsiDispatch:
        this.handleCsi(action);
        break;
      case ActionType.EscDispatch:
        this.handleEsc(action.intermediates, action.finalByte);
        break;
      case ActionType.OscDispatch:
        this.handleOsc(action);
        break;
    }
  }

  private printChar(char: string): void {
    if (this.cursor.col >= this.cols) {
      if (this.modes.autoWrap) {
        this.cursor.col = 0;
        this.lineFeed();
      } else {
        this.cursor.col = this.cols - 1;
      }
    }

    this.cells[this.cursor.row][this.cursor.col] = {
      char,
      attrs: { ...this.attrs },
    };
    this.cursor.col++;
  }

  private executeControl(code: number): void {
    switch (code) {
      case 0x07: // BEL
        break;
      case 0x08: // BS (backspace)
        if (this.cursor.col > 0) this.cursor.col--;
        break;
      case 0x09: // HT (tab)
        this.cursor.col = Math.min(this.cols - 1, (Math.floor(this.cursor.col / 8) + 1) * 8);
        break;
      case 0x0a: // LF
      case 0x0b: // VT
      case 0x0c: // FF
        this.lineFeed();
        break;
      case 0x0d: // CR
        this.cursor.col = 0;
        break;
    }
  }

  private lineFeed(): void {
    if (this.cursor.row === this.scrollBottom) {
      this.scrollUp(1);
    } else if (this.cursor.row < this.rows - 1) {
      this.cursor.row++;
    }
  }

  private reverseLineFeed(): void {
    if (this.cursor.row === this.scrollTop) {
      this.scrollDown(1);
    } else if (this.cursor.row > 0) {
      this.cursor.row--;
    }
  }

  private scrollUp(n: number): void {
    for (let i = 0; i < n; i++) {
      this.cells.splice(this.scrollTop, 1);
      const newRow = this.createRow();
      this.cells.splice(this.scrollBottom, 0, newRow);
    }
  }

  private scrollDown(n: number): void {
    for (let i = 0; i < n; i++) {
      this.cells.splice(this.scrollBottom, 1);
      const newRow = this.createRow();
      this.cells.splice(this.scrollTop, 0, newRow);
    }
  }

  private handleCsi(action: CsiAction): void {
    const params = action.params;
    const finalByte = action.finalByte;

    // Handle private mode sequences (CSI ? ...)
    if (action.intermediates === '?') {
      this.handlePrivateMode(params, finalByte);
      return;
    }

    switch (finalByte) {
      case 'A': // CUU - Cursor Up
        this.cursor.row = Math.max(this.scrollTop, this.cursor.row - Math.max(1, params[0] || 1));
        break;
      case 'B': // CUD - Cursor Down
        this.cursor.row = Math.min(this.scrollBottom, this.cursor.row + Math.max(1, params[0] || 1));
        break;
      case 'C': // CUF - Cursor Forward
        this.cursor.col = Math.min(this.cols - 1, this.cursor.col + Math.max(1, params[0] || 1));
        break;
      case 'D': // CUB - Cursor Back
        this.cursor.col = Math.max(0, this.cursor.col - Math.max(1, params[0] || 1));
        break;
      case 'E': // CNL - Cursor Next Line
        this.cursor.col = 0;
        this.cursor.row = Math.min(this.scrollBottom, this.cursor.row + Math.max(1, params[0] || 1));
        break;
      case 'F': // CPL - Cursor Previous Line
        this.cursor.col = 0;
        this.cursor.row = Math.max(this.scrollTop, this.cursor.row - Math.max(1, params[0] || 1));
        break;
      case 'G': // CHA - Cursor Horizontal Absolute
        this.cursor.col = Math.min(this.cols - 1, Math.max(0, (params[0] || 1) - 1));
        break;
      case 'H': // CUP - Cursor Position
      case 'f': // HVP - Horizontal and Vertical Position
        this.cursor.row = Math.min(this.rows - 1, Math.max(0, (params[0] || 1) - 1));
        this.cursor.col = Math.min(this.cols - 1, Math.max(0, (params[1] || 1) - 1));
        break;
      case 'J': // ED - Erase in Display
        this.eraseInDisplay(params[0] || 0);
        break;
      case 'K': // EL - Erase in Line
        this.eraseInLine(params[0] || 0);
        break;
      case 'L': // IL - Insert Lines
        this.insertLines(Math.max(1, params[0] || 1));
        break;
      case 'M': // DL - Delete Lines
        this.deleteLines(Math.max(1, params[0] || 1));
        break;
      case 'P': // DCH - Delete Characters
        this.deleteChars(Math.max(1, params[0] || 1));
        break;
      case 'S': // SU - Scroll Up
        this.scrollUp(Math.max(1, params[0] || 1));
        break;
      case 'T': // SD - Scroll Down
        this.scrollDown(Math.max(1, params[0] || 1));
        break;
      case 'X': // ECH - Erase Characters
        this.eraseChars(Math.max(1, params[0] || 1));
        break;
      case 'd': // VPA - Vertical Position Absolute
        this.cursor.row = Math.min(this.rows - 1, Math.max(0, (params[0] || 1) - 1));
        break;
      case 'm': // SGR - Select Graphic Rendition
        this.handleSgr(params);
        break;
      case 'r': // DECSTBM - Set Scrolling Region
        this.scrollTop = Math.max(0, (params[0] || 1) - 1);
        this.scrollBottom = Math.min(this.rows - 1, (params[1] || this.rows) - 1);
        this.cursor.row = 0;
        this.cursor.col = 0;
        break;
      case '@': // ICH - Insert Characters
        this.insertChars(Math.max(1, params[0] || 1));
        break;
      case 'n': // DSR - Device Status Report (we ignore queries)
        break;
      case 'c': // DA - Device Attributes (ignore)
        break;
    }
  }

  private handlePrivateMode(params: number[], finalByte: string): void {
    const set = finalByte === 'h';
    if (finalByte !== 'h' && finalByte !== 'l') return;

    for (const p of params) {
      switch (p) {
        case 1: // DECCKM
          this.modes.applicationCursor = set;
          break;
        case 6: // DECOM
          this.modes.originMode = set;
          break;
        case 7: // DECAWM
          this.modes.autoWrap = set;
          break;
        case 25: // DECTCEM - show/hide cursor
          this.cursor.visible = set;
          break;
        case 1049: // Alternate screen buffer
          if (set && !this.modes.alternateBuffer) {
            this.altCells = this.cells;
            this.altCursor = { ...this.cursor };
            this.cells = this.createGrid();
            this.cursor = { row: 0, col: 0, visible: this.cursor.visible };
            this.modes.alternateBuffer = true;
          } else if (!set && this.modes.alternateBuffer) {
            if (this.altCells) this.cells = this.altCells;
            if (this.altCursor) this.cursor = this.altCursor;
            this.altCells = null;
            this.altCursor = null;
            this.modes.alternateBuffer = false;
          }
          break;
        case 2004: // Bracketed paste
          this.modes.bracketedPaste = set;
          break;
      }
    }
  }

  private handleSgr(params: number[]): void {
    if (params.length === 0) {
      this.attrs = defaultAttrs();
      return;
    }

    let i = 0;
    while (i < params.length) {
      const p = params[i];
      switch (p) {
        case 0:
          this.attrs = defaultAttrs();
          break;
        case 1:
          this.attrs.bold = true;
          break;
        case 2:
          this.attrs.dim = true;
          break;
        case 3:
          this.attrs.italic = true;
          break;
        case 4:
          this.attrs.underline = true;
          break;
        case 5:
          this.attrs.blink = true;
          break;
        case 7:
          this.attrs.inverse = true;
          break;
        case 8:
          this.attrs.hidden = true;
          break;
        case 9:
          this.attrs.strikethrough = true;
          break;
        case 22:
          this.attrs.bold = false;
          this.attrs.dim = false;
          break;
        case 23:
          this.attrs.italic = false;
          break;
        case 24:
          this.attrs.underline = false;
          break;
        case 25:
          this.attrs.blink = false;
          break;
        case 27:
          this.attrs.inverse = false;
          break;
        case 28:
          this.attrs.hidden = false;
          break;
        case 29:
          this.attrs.strikethrough = false;
          break;
        // Foreground colors
        case 30: case 31: case 32: case 33:
        case 34: case 35: case 36: case 37:
          this.attrs.fg = p - 30;
          break;
        case 38:
          // Extended foreground color
          if (params[i + 1] === 5 && i + 2 < params.length) {
            this.attrs.fg = params[i + 2];
            i += 2;
          }
          break;
        case 39:
          this.attrs.fg = -1; // default
          break;
        // Background colors
        case 40: case 41: case 42: case 43:
        case 44: case 45: case 46: case 47:
          this.attrs.bg = p - 40;
          break;
        case 48:
          // Extended background color
          if (params[i + 1] === 5 && i + 2 < params.length) {
            this.attrs.bg = params[i + 2];
            i += 2;
          }
          break;
        case 49:
          this.attrs.bg = -1; // default
          break;
        // Bright foreground colors
        case 90: case 91: case 92: case 93:
        case 94: case 95: case 96: case 97:
          this.attrs.fg = p - 90 + 8;
          break;
        // Bright background colors
        case 100: case 101: case 102: case 103:
        case 104: case 105: case 106: case 107:
          this.attrs.bg = p - 100 + 8;
          break;
      }
      i++;
    }
  }

  private handleEsc(intermediates: string, finalByte: string): void {
    if (intermediates === '') {
      switch (finalByte) {
        case '7': // DECSC - Save Cursor
          this.savedCursor = { ...this.cursor };
          this.savedAttrs = { ...this.attrs };
          break;
        case '8': // DECRC - Restore Cursor
          if (this.savedCursor) this.cursor = { ...this.savedCursor };
          if (this.savedAttrs) this.attrs = { ...this.savedAttrs };
          break;
        case 'D': // IND - Index (line feed)
          this.lineFeed();
          break;
        case 'E': // NEL - Next Line
          this.cursor.col = 0;
          this.lineFeed();
          break;
        case 'M': // RI - Reverse Index
          this.reverseLineFeed();
          break;
        case 'c': // RIS - Full Reset
          this.reset();
          break;
      }
    }
  }

  private handleOsc(action: OscAction): void {
    const data = action.data;
    const semicolonIndex = data.indexOf(';');
    if (semicolonIndex === -1) return;

    const ps = parseInt(data.substring(0, semicolonIndex), 10);
    const pt = data.substring(semicolonIndex + 1);

    switch (ps) {
      case 0: // Set icon name and window title
      case 2: // Set window title
        this.title = pt;
        break;
      case 1: // Set icon name (ignore)
        break;
    }
  }

  private eraseInDisplay(mode: number): void {
    switch (mode) {
      case 0: // Erase from cursor to end
        this.eraseInLine(0);
        for (let r = this.cursor.row + 1; r < this.rows; r++) {
          this.cells[r] = this.createRow();
        }
        break;
      case 1: // Erase from start to cursor
        for (let r = 0; r < this.cursor.row; r++) {
          this.cells[r] = this.createRow();
        }
        for (let c = 0; c <= this.cursor.col; c++) {
          this.cells[this.cursor.row][c] = blankCell();
        }
        break;
      case 2: // Erase entire display
        this.cells = this.createGrid();
        break;
      case 3: // Erase scrollback (we don't have scrollback, clear display)
        this.cells = this.createGrid();
        break;
    }
  }

  private eraseInLine(mode: number): void {
    const row = this.cells[this.cursor.row];
    switch (mode) {
      case 0: // Erase from cursor to end of line
        for (let c = this.cursor.col; c < this.cols; c++) {
          row[c] = blankCell();
        }
        break;
      case 1: // Erase from start to cursor
        for (let c = 0; c <= this.cursor.col; c++) {
          row[c] = blankCell();
        }
        break;
      case 2: // Erase entire line
        for (let c = 0; c < this.cols; c++) {
          row[c] = blankCell();
        }
        break;
    }
  }

  private insertLines(n: number): void {
    if (this.cursor.row < this.scrollTop || this.cursor.row > this.scrollBottom) return;
    n = Math.min(n, this.scrollBottom - this.cursor.row + 1);
    for (let i = 0; i < n; i++) {
      this.cells.splice(this.scrollBottom, 1);
      this.cells.splice(this.cursor.row, 0, this.createRow());
    }
  }

  private deleteLines(n: number): void {
    if (this.cursor.row < this.scrollTop || this.cursor.row > this.scrollBottom) return;
    n = Math.min(n, this.scrollBottom - this.cursor.row + 1);
    for (let i = 0; i < n; i++) {
      this.cells.splice(this.cursor.row, 1);
      this.cells.splice(this.scrollBottom, 0, this.createRow());
    }
  }

  private deleteChars(n: number): void {
    const row = this.cells[this.cursor.row];
    n = Math.min(n, this.cols - this.cursor.col);
    row.splice(this.cursor.col, n);
    for (let i = 0; i < n; i++) {
      row.push(blankCell());
    }
  }

  private insertChars(n: number): void {
    const row = this.cells[this.cursor.row];
    n = Math.min(n, this.cols - this.cursor.col);
    for (let i = 0; i < n; i++) {
      row.splice(this.cursor.col, 0, blankCell());
    }
    row.length = this.cols;
  }

  private eraseChars(n: number): void {
    const row = this.cells[this.cursor.row];
    n = Math.min(n, this.cols - this.cursor.col);
    for (let i = 0; i < n; i++) {
      row[this.cursor.col + i] = blankCell();
    }
  }

  private reset(): void {
    this.cells = this.createGrid();
    this.cursor = { row: 0, col: 0, visible: true };
    this.attrs = defaultAttrs();
    this.scrollTop = 0;
    this.scrollBottom = this.rows - 1;
    this.title = '';
    this.modes = {
      applicationCursor: false,
      originMode: false,
      autoWrap: true,
      bracketedPaste: false,
      alternateBuffer: false,
    };
  }
}
