import { describe, expect, it } from 'vitest';
import { parseCommand } from './command-parser';

describe('parseCommand', () => {
  it('parses archive single', () => {
    expect(parseCommand('@Freeze this')).toEqual({ command: 'archive', mode: 'single' });
    expect(parseCommand('this')).toEqual({ command: 'archive', mode: 'single' });
  });

  it('parses archive thread', () => {
    expect(parseCommand('@Freeze this thread')).toEqual({ command: 'archive', mode: 'thread' });
    expect(parseCommand('@freezebot   this   thread please')).toEqual({
      command: 'archive',
      mode: 'thread'
    });
  });

  it('parses recover', () => {
    expect(parseCommand('@Freeze recover')).toEqual({ command: 'recover', mode: 'single' });
  });

  it('parses status', () => {
    expect(parseCommand('@Freeze status')).toEqual({ command: 'status', mode: 'single' });
  });

  it('returns null for unsupported text', () => {
    expect(parseCommand('hello there')).toBeNull();
    expect(parseCommand('@Freeze unknown')).toBeNull();
    expect(parseCommand('')).toBeNull();
  });
});
