import { MogTermEngine } from "../src/engine.js";
import { TerminalState, CellAttrs } from "../src/types.js";

/**
 * Test adapter that bridges between libvterm-style test fixtures
 * and MogTerm's engine API.
 *
 * Responsibilities:
 *  - Create and configure an engine instance
 *  - Feed raw input sequences
 *  - Extract terminal state for assertion
 */
export class TerminalTestAdapter {
  private engine: MogTermEngine;

  constructor(rows = 24, cols = 80) {
    this.engine = new MogTermEngine(rows, cols);
  }

  /** Feed a raw string (may include escape sequences) into the engine. */
  feedInput(data: string): void {
    this.engine.feed(data);
  }

  /** Get the full terminal state snapshot. */
  getState(): TerminalState {
    return this.engine.getState();
  }

  /** Get cursor position as [row, col] (0-based). */
  getCursor(): [number, number] {
    const s = this.getState();
    return [s.cursorRow, s.cursorCol];
  }

  /** Get a line of text content (trailing whitespace trimmed). */
  getLineText(row: number): string {
    return this.engine.getLineText(row);
  }

  /** Get the attributes of a specific cell. */
  getCellAttrs(row: number, col: number): CellAttrs {
    const s = this.getState();
    return s.cells[row][col].attrs;
  }

  /** Get the character at a specific cell. */
  getCellChar(row: number, col: number): string {
    const s = this.getState();
    return s.cells[row][col].char;
  }

  /** Reset the terminal. */
  reset(): void {
    this.engine.reset();
  }
}
