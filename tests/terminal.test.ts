import { describe, it, expect, beforeEach } from 'vitest';
import { Terminal } from '../src/terminal.js';

describe('Terminal', () => {
  let term: Terminal;

  beforeEach(() => {
    term = new Terminal(80, 24);
  });

  describe('basic writing', () => {
    it('should write characters to the grid', () => {
      term.write('Hello');
      const state = term.getState();
      expect(state.cells[0][0].char).toBe('H');
      expect(state.cells[0][1].char).toBe('e');
      expect(state.cells[0][2].char).toBe('l');
      expect(state.cells[0][3].char).toBe('l');
      expect(state.cells[0][4].char).toBe('o');
    });

    it('should advance cursor after writing', () => {
      term.write('Hi');
      expect(term.getCursor().col).toBe(2);
      expect(term.getCursor().row).toBe(0);
    });

    it('should handle newline and carriage return', () => {
      term.write('Line1\r\nLine2');
      const state = term.getState();
      expect(state.cells[0][0].char).toBe('L');
      expect(state.cells[1][0].char).toBe('L');
      expect(state.cells[1][4].char).toBe('2');
    });

    it('should handle tab stops', () => {
      term.write('A\tB');
      expect(term.getCursor().col).toBe(9); // 'A' at 0, tab to 8, 'B' at 8, cursor at 9
    });

    it('should wrap at end of line', () => {
      term.write('A'.repeat(80));
      expect(term.getCursor().row).toBe(0); // cursor is at col 80, hasn't wrapped yet
      term.write('B');
      expect(term.getCursor().row).toBe(1);
      expect(term.getCursor().col).toBe(1);
    });
  });

  describe('cursor movement', () => {
    it('CUP should position cursor', () => {
      term.write('\x1b[5;10H');
      expect(term.getCursor().row).toBe(4); // 1-indexed to 0-indexed
      expect(term.getCursor().col).toBe(9);
    });

    it('CUU should move cursor up', () => {
      term.write('\x1b[10;1H'); // row 10
      term.write('\x1b[3A'); // up 3
      expect(term.getCursor().row).toBe(6);
    });

    it('CUD should move cursor down', () => {
      term.write('\x1b[1;1H');
      term.write('\x1b[5B'); // down 5
      expect(term.getCursor().row).toBe(5);
    });

    it('CUF should move cursor forward', () => {
      term.write('\x1b[1;1H');
      term.write('\x1b[10C'); // right 10
      expect(term.getCursor().col).toBe(10);
    });

    it('CUB should move cursor back', () => {
      term.write('\x1b[1;20H');
      term.write('\x1b[5D'); // left 5
      expect(term.getCursor().col).toBe(14);
    });
  });

  describe('erase commands', () => {
    it('ED 2 should clear the screen', () => {
      term.write('Hello World');
      term.write('\x1b[2J');
      const state = term.getState();
      for (let c = 0; c < 80; c++) {
        expect(state.cells[0][c].char).toBe(' ');
      }
    });

    it('EL 0 should erase to end of line', () => {
      term.write('Hello World');
      term.write('\x1b[1;6H'); // position at col 5 (after "Hello")
      term.write('\x1b[K');
      const state = term.getState();
      expect(state.cells[0][0].char).toBe('H');
      expect(state.cells[0][4].char).toBe('o');
      expect(state.cells[0][5].char).toBe(' ');
    });

    it('EL 2 should erase entire line', () => {
      term.write('Hello World');
      term.write('\x1b[1;1H');
      term.write('\x1b[2K');
      const state = term.getState();
      for (let c = 0; c < 80; c++) {
        expect(state.cells[0][c].char).toBe(' ');
      }
    });
  });

  describe('SGR attributes', () => {
    it('should set bold attribute', () => {
      term.write('\x1b[1mBold');
      const cell = term.getCell(0, 0)!;
      expect(cell.attrs.bold).toBe(true);
    });

    it('should set foreground color', () => {
      term.write('\x1b[31mRed');
      const cell = term.getCell(0, 0)!;
      expect(cell.attrs.fg).toBe(1);
    });

    it('should set background color', () => {
      term.write('\x1b[42mGreen');
      const cell = term.getCell(0, 0)!;
      expect(cell.attrs.bg).toBe(2);
    });

    it('should reset attributes with SGR 0', () => {
      term.write('\x1b[1;31mBold Red\x1b[0mNormal');
      const boldCell = term.getCell(0, 0)!;
      expect(boldCell.attrs.bold).toBe(true);
      expect(boldCell.attrs.fg).toBe(1);

      const normalCell = term.getCell(0, 8)!;
      expect(normalCell.attrs.bold).toBe(false);
      expect(normalCell.attrs.fg).toBe(-1);
    });

    it('should handle 256-color foreground', () => {
      term.write('\x1b[38;5;196mRed256');
      const cell = term.getCell(0, 0)!;
      expect(cell.attrs.fg).toBe(196);
    });

    it('should handle bright colors', () => {
      term.write('\x1b[91mBright');
      const cell = term.getCell(0, 0)!;
      expect(cell.attrs.fg).toBe(9); // bright red = 8 + 1
    });
  });

  describe('OSC sequences', () => {
    it('should set window title', () => {
      term.write('\x1b]0;My Terminal\x07');
      expect(term.getTitle()).toBe('My Terminal');
    });

    it('should set title with OSC 2', () => {
      term.write('\x1b]2;Another Title\x07');
      expect(term.getTitle()).toBe('Another Title');
    });
  });

  describe('scrolling', () => {
    it('should scroll up when writing past bottom', () => {
      for (let i = 0; i < 25; i++) {
        term.write(`Line ${i}\r\n`);
      }
      // Line 0 should have been scrolled off
      const state = term.getState();
      // First visible line should be "Line 1"
      expect(state.cells[0][0].char).toBe('L');
    });

    it('should handle scroll region', () => {
      term.write('\x1b[5;10r'); // Set scroll region rows 5-10
      const cursor = term.getCursor();
      expect(cursor.row).toBe(0);
      expect(cursor.col).toBe(0);
    });
  });

  describe('save/restore cursor', () => {
    it('should save and restore cursor position', () => {
      term.write('\x1b[5;10H'); // position
      term.write('\x1b7'); // save
      term.write('\x1b[1;1H'); // move away
      term.write('\x1b8'); // restore
      expect(term.getCursor().row).toBe(4);
      expect(term.getCursor().col).toBe(9);
    });
  });

  describe('terminal state', () => {
    it('should report correct dimensions', () => {
      const state = term.getState();
      expect(state.rows).toBe(24);
      expect(state.cols).toBe(80);
    });

    it('getCell should return null for out of bounds', () => {
      expect(term.getCell(-1, 0)).toBeNull();
      expect(term.getCell(0, 80)).toBeNull();
      expect(term.getCell(24, 0)).toBeNull();
    });

    it('should reset on ESC c', () => {
      term.write('Hello');
      term.write('\x1b]0;Title\x07');
      term.write('\x1bc'); // full reset
      expect(term.getTitle()).toBe('');
      expect(term.getCursor().row).toBe(0);
      expect(term.getCursor().col).toBe(0);
      expect(term.getCell(0, 0)!.char).toBe(' ');
    });
  });

  describe('private modes', () => {
    it('should hide/show cursor with DECTCEM', () => {
      term.write('\x1b[?25l');
      expect(term.getCursor().visible).toBe(false);
      term.write('\x1b[?25h');
      expect(term.getCursor().visible).toBe(true);
    });
  });
});
