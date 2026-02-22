export type CommandMode = 'single' | 'thread';
export type BotCommand = 'archive' | 'recover' | 'status';

export type ParsedCommand =
  | {
      command: 'archive';
      mode: CommandMode;
    }
  | {
      command: 'recover' | 'status';
      mode: 'single';
    };

const handlePattern = /^@freeze(bot)?\s*/i;
const whitespacePattern = /\s+/g;

function normalizeText(input: string) {
  return input.replace(whitespacePattern, ' ').trim().toLowerCase();
}

export function parseCommand(input: string): ParsedCommand | null {
  const normalized = normalizeText(input);
  if (!normalized) {
    return null;
  }

  const withoutHandle = normalized.replace(handlePattern, '');

  if (withoutHandle.startsWith('this thread')) {
    return { command: 'archive', mode: 'thread' };
  }

  if (withoutHandle.startsWith('this')) {
    return { command: 'archive', mode: 'single' };
  }

  if (withoutHandle.startsWith('recover')) {
    return { command: 'recover', mode: 'single' };
  }

  if (withoutHandle.startsWith('status')) {
    return { command: 'status', mode: 'single' };
  }

  return null;
}
