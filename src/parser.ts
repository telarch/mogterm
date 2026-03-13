/**
 * Escape sequence parser for ANSI/VT100 terminal output.
 *
 * Parses raw byte streams into structured actions that the terminal
 * state machine can execute.
 */

export const enum ParserState {
  Ground,
  Escape,
  EscapeIntermediate,
  CsiEntry,
  CsiParam,
  CsiIntermediate,
  OscString,
}

export const enum ActionType {
  Print,
  Execute,
  CsiDispatch,
  EscDispatch,
  OscDispatch,
}

export interface PrintAction {
  type: ActionType.Print;
  char: string;
}

export interface ExecuteAction {
  type: ActionType.Execute;
  code: number;
}

export interface CsiAction {
  type: ActionType.CsiDispatch;
  params: number[];
  intermediates: string;
  finalByte: string;
}

export interface EscAction {
  type: ActionType.EscDispatch;
  intermediates: string;
  finalByte: string;
}

export interface OscAction {
  type: ActionType.OscDispatch;
  data: string;
}

export type Action = PrintAction | ExecuteAction | CsiAction | EscAction | OscAction;

export type ActionHandler = (action: Action) => void;

/**
 * ANSI escape sequence parser.
 *
 * Implements a state machine that processes bytes one at a time
 * and emits structured actions.
 */
export class Parser {
  private state: ParserState = ParserState.Ground;
  private params: number[] = [];
  private currentParam = 0;
  private hasParam = false;
  private intermediates = '';
  private oscData = '';

  /** Feed a string of data into the parser. */
  feed(data: string, handler: ActionHandler): void {
    for (let i = 0; i < data.length; i++) {
      this.processByte(data[i], data.charCodeAt(i), handler);
    }
  }

  private processByte(char: string, code: number, handler: ActionHandler): void {
    switch (this.state) {
      case ParserState.Ground:
        this.handleGround(char, code, handler);
        break;
      case ParserState.Escape:
        this.handleEscape(char, code, handler);
        break;
      case ParserState.EscapeIntermediate:
        this.handleEscapeIntermediate(char, code, handler);
        break;
      case ParserState.CsiEntry:
        this.handleCsiEntry(char, code, handler);
        break;
      case ParserState.CsiParam:
        this.handleCsiParam(char, code, handler);
        break;
      case ParserState.CsiIntermediate:
        this.handleCsiIntermediate(char, code, handler);
        break;
      case ParserState.OscString:
        this.handleOscString(char, code, handler);
        break;
    }
  }

  private handleGround(char: string, code: number, handler: ActionHandler): void {
    if (code === 0x1b) {
      this.state = ParserState.Escape;
    } else if (code < 0x20 || code === 0x7f) {
      // C0 control codes
      handler({ type: ActionType.Execute, code });
    } else {
      handler({ type: ActionType.Print, char });
    }
  }

  private handleEscape(char: string, code: number, handler: ActionHandler): void {
    if (code === 0x5b) {
      // '[' -> CSI
      this.state = ParserState.CsiEntry;
      this.params = [];
      this.currentParam = 0;
      this.hasParam = false;
      this.intermediates = '';
    } else if (code === 0x5d) {
      // ']' -> OSC
      this.state = ParserState.OscString;
      this.oscData = '';
    } else if (code >= 0x20 && code <= 0x2f) {
      // Intermediate bytes
      this.intermediates = char;
      this.state = ParserState.EscapeIntermediate;
    } else if (code >= 0x30 && code <= 0x7e) {
      // Final byte
      handler({
        type: ActionType.EscDispatch,
        intermediates: '',
        finalByte: char,
      });
      this.state = ParserState.Ground;
    } else if (code === 0x1b) {
      // ESC ESC -> stay in escape
    } else {
      // Cancel / ignore
      this.state = ParserState.Ground;
    }
  }

  private handleEscapeIntermediate(char: string, code: number, handler: ActionHandler): void {
    if (code >= 0x20 && code <= 0x2f) {
      this.intermediates += char;
    } else if (code >= 0x30 && code <= 0x7e) {
      handler({
        type: ActionType.EscDispatch,
        intermediates: this.intermediates,
        finalByte: char,
      });
      this.state = ParserState.Ground;
    } else {
      this.state = ParserState.Ground;
    }
  }

  private handleCsiEntry(char: string, code: number, handler: ActionHandler): void {
    if (code >= 0x30 && code <= 0x39) {
      // Digit
      this.currentParam = code - 0x30;
      this.hasParam = true;
      this.state = ParserState.CsiParam;
    } else if (code === 0x3b) {
      // ';' separator
      this.params.push(0);
      this.state = ParserState.CsiParam;
    } else if (code === 0x3f) {
      // '?' private marker
      this.intermediates = '?';
      this.state = ParserState.CsiParam;
    } else if (code >= 0x40 && code <= 0x7e) {
      // Final byte with no params
      handler({
        type: ActionType.CsiDispatch,
        params: [],
        intermediates: this.intermediates,
        finalByte: char,
      });
      this.state = ParserState.Ground;
    } else if (code === 0x1b) {
      this.state = ParserState.Escape;
    } else {
      this.state = ParserState.Ground;
    }
  }

  private handleCsiParam(char: string, code: number, handler: ActionHandler): void {
    if (code >= 0x30 && code <= 0x39) {
      this.currentParam = this.currentParam * 10 + (code - 0x30);
      this.hasParam = true;
    } else if (code === 0x3b) {
      this.params.push(this.hasParam ? this.currentParam : 0);
      this.currentParam = 0;
      this.hasParam = false;
    } else if (code >= 0x20 && code <= 0x2f) {
      // Intermediate bytes
      if (this.hasParam) {
        this.params.push(this.currentParam);
      }
      this.intermediates += char;
      this.state = ParserState.CsiIntermediate;
    } else if (code >= 0x40 && code <= 0x7e) {
      // Final byte
      if (this.hasParam) {
        this.params.push(this.currentParam);
      }
      handler({
        type: ActionType.CsiDispatch,
        params: this.params,
        intermediates: this.intermediates,
        finalByte: char,
      });
      this.state = ParserState.Ground;
    } else if (code === 0x1b) {
      this.state = ParserState.Escape;
    } else {
      this.state = ParserState.Ground;
    }
  }

  private handleCsiIntermediate(char: string, code: number, handler: ActionHandler): void {
    if (code >= 0x20 && code <= 0x2f) {
      this.intermediates += char;
    } else if (code >= 0x40 && code <= 0x7e) {
      handler({
        type: ActionType.CsiDispatch,
        params: this.params,
        intermediates: this.intermediates,
        finalByte: char,
      });
      this.state = ParserState.Ground;
    } else {
      this.state = ParserState.Ground;
    }
  }

  private handleOscString(char: string, code: number, handler: ActionHandler): void {
    if (code === 0x07 || code === 0x1b) {
      // BEL or ESC terminates OSC (ESC \ is ST, but we accept bare ESC too)
      handler({
        type: ActionType.OscDispatch,
        data: this.oscData,
      });
      this.state = code === 0x1b ? ParserState.Escape : ParserState.Ground;
    } else if (code === 0x9c) {
      // ST (String Terminator)
      handler({
        type: ActionType.OscDispatch,
        data: this.oscData,
      });
      this.state = ParserState.Ground;
    } else {
      this.oscData += char;
    }
  }
}
