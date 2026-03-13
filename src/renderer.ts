/**
 * Browser-based renderer for the MogTerm terminal engine.
 *
 * Renders terminal state into a DOM element using a grid of
 * span elements for efficient updates.
 */

import type { TerminalState, Cell, CellAttributes } from './types.js';

/** Standard 8-color ANSI palette + bright variants. */
const ANSI_COLORS = [
  '#000000', '#cc0000', '#4e9a06', '#c4a000',
  '#3465a4', '#75507b', '#06989a', '#d3d7cf',
  '#555753', '#ef2929', '#8ae234', '#fce94f',
  '#729fcf', '#ad7fa8', '#34e2e2', '#eeeeec',
];

/** Convert a color index to a CSS color string. */
function colorToCSS(index: number): string {
  if (index < 0) return '';
  if (index < 16) return ANSI_COLORS[index];
  if (index < 232) {
    // 216 color cube: 16 + 36*r + 6*g + b
    const n = index - 16;
    const b = (n % 6) * 51;
    const g = (Math.floor(n / 6) % 6) * 51;
    const r = Math.floor(n / 36) * 51;
    return `rgb(${r},${g},${b})`;
  }
  // Grayscale ramp: 232-255 -> 8, 18, ..., 238
  const level = (index - 232) * 10 + 8;
  return `rgb(${level},${level},${level})`;
}

/** Build inline CSS for cell attributes. */
function attrsToStyle(attrs: CellAttributes, inverse: boolean): string {
  const parts: string[] = [];
  let fg = attrs.fg;
  let bg = attrs.bg;

  if (attrs.bold && fg >= 0 && fg < 8) {
    fg += 8; // bold brightens normal colors
  }

  if (inverse || attrs.inverse) {
    [fg, bg] = [bg, fg];
  }

  if (fg >= 0) parts.push(`color:${colorToCSS(fg)}`);
  if (bg >= 0) parts.push(`background-color:${colorToCSS(bg)}`);
  if (attrs.bold) parts.push('font-weight:bold');
  if (attrs.dim) parts.push('opacity:0.5');
  if (attrs.italic) parts.push('font-style:italic');
  if (attrs.underline) parts.push('text-decoration:underline');
  if (attrs.strikethrough) {
    parts.push(attrs.underline
      ? 'text-decoration:underline line-through'
      : 'text-decoration:line-through');
  }
  if (attrs.hidden) parts.push('visibility:hidden');

  return parts.join(';');
}

export class Renderer {
  private container: HTMLElement;
  private pre: HTMLPreElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.backgroundColor = '#1e1e1e';
    this.container.style.padding = '8px';
    this.container.style.overflow = 'hidden';

    this.pre = document.createElement('pre');
    this.pre.style.margin = '0';
    this.pre.style.fontFamily = "'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace";
    this.pre.style.fontSize = '14px';
    this.pre.style.lineHeight = '1.2';
    this.pre.style.color = '#d4d4d4';
    this.container.appendChild(this.pre);
  }

  /** Render the full terminal state. */
  render(state: TerminalState): void {
    const lines: string[] = [];

    for (let r = 0; r < state.rows; r++) {
      const spans: string[] = [];
      let c = 0;

      while (c < state.cols) {
        const cell = state.cells[r][c];
        const isCursor = state.cursor.visible && r === state.cursor.row && c === state.cursor.col;
        const style = attrsToStyle(cell.attrs, isCursor);

        // Batch adjacent cells with the same style
        let text = this.escapeHtml(cell.char);
        let next = c + 1;
        while (next < state.cols) {
          const nextCell = state.cells[r][next];
          const nextIsCursor = state.cursor.visible && r === state.cursor.row && next === state.cursor.col;
          const nextStyle = attrsToStyle(nextCell.attrs, nextIsCursor);
          if (nextStyle !== style) break;
          text += this.escapeHtml(nextCell.char);
          next++;
        }

        if (style) {
          spans.push(`<span style="${style}">${text}</span>`);
        } else {
          spans.push(text);
        }
        c = next;
      }

      lines.push(spans.join(''));
    }

    this.pre.innerHTML = lines.join('\n');
  }

  private escapeHtml(char: string): string {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return char;
    }
  }
}
