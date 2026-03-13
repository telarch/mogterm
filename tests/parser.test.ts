import { describe, it, expect } from 'vitest';
import { Parser, ActionType } from '../src/parser.js';
import type { Action, CsiAction, PrintAction, ExecuteAction, EscAction, OscAction } from '../src/parser.js';

function collectActions(input: string): Action[] {
  const parser = new Parser();
  const actions: Action[] = [];
  parser.feed(input, (a) => actions.push(a));
  return actions;
}

describe('Parser', () => {
  it('should parse printable characters', () => {
    const actions = collectActions('Hello');
    expect(actions).toHaveLength(5);
    expect(actions.every((a) => a.type === ActionType.Print)).toBe(true);
    expect((actions as PrintAction[]).map((a) => a.char).join('')).toBe('Hello');
  });

  it('should parse control codes', () => {
    const actions = collectActions('\n\r\t');
    expect(actions).toHaveLength(3);
    expect(actions[0]).toEqual({ type: ActionType.Execute, code: 0x0a });
    expect(actions[1]).toEqual({ type: ActionType.Execute, code: 0x0d });
    expect(actions[2]).toEqual({ type: ActionType.Execute, code: 0x09 });
  });

  it('should parse CSI sequences with params', () => {
    const actions = collectActions('\x1b[10;20H');
    expect(actions).toHaveLength(1);
    const csi = actions[0] as CsiAction;
    expect(csi.type).toBe(ActionType.CsiDispatch);
    expect(csi.params).toEqual([10, 20]);
    expect(csi.finalByte).toBe('H');
  });

  it('should parse CSI with no params', () => {
    const actions = collectActions('\x1b[H');
    expect(actions).toHaveLength(1);
    const csi = actions[0] as CsiAction;
    expect(csi.params).toEqual([]);
    expect(csi.finalByte).toBe('H');
  });

  it('should parse SGR sequence', () => {
    const actions = collectActions('\x1b[1;31m');
    expect(actions).toHaveLength(1);
    const csi = actions[0] as CsiAction;
    expect(csi.params).toEqual([1, 31]);
    expect(csi.finalByte).toBe('m');
  });

  it('should parse private mode sequences', () => {
    const actions = collectActions('\x1b[?25h');
    expect(actions).toHaveLength(1);
    const csi = actions[0] as CsiAction;
    expect(csi.intermediates).toBe('?');
    expect(csi.params).toEqual([25]);
    expect(csi.finalByte).toBe('h');
  });

  it('should parse ESC sequences', () => {
    const actions = collectActions('\x1b7');
    expect(actions).toHaveLength(1);
    const esc = actions[0] as EscAction;
    expect(esc.type).toBe(ActionType.EscDispatch);
    expect(esc.finalByte).toBe('7');
  });

  it('should parse OSC sequences terminated by BEL', () => {
    const actions = collectActions('\x1b]0;My Title\x07');
    expect(actions).toHaveLength(1);
    const osc = actions[0] as OscAction;
    expect(osc.type).toBe(ActionType.OscDispatch);
    expect(osc.data).toBe('0;My Title');
  });

  it('should handle mixed content', () => {
    const actions = collectActions('Hello\x1b[31m World\x1b[0m');
    const types = actions.map((a) => a.type);
    // Hello (5 prints), CSI 31m, space+World (6 prints), CSI 0m
    expect(types.filter((t) => t === ActionType.Print)).toHaveLength(11);
    expect(types.filter((t) => t === ActionType.CsiDispatch)).toHaveLength(2);
  });

  it('should parse erase commands', () => {
    const actions = collectActions('\x1b[2J');
    const csi = actions[0] as CsiAction;
    expect(csi.params).toEqual([2]);
    expect(csi.finalByte).toBe('J');
  });

  it('should parse 256-color SGR', () => {
    const actions = collectActions('\x1b[38;5;196m');
    const csi = actions[0] as CsiAction;
    expect(csi.params).toEqual([38, 5, 196]);
    expect(csi.finalByte).toBe('m');
  });
});
