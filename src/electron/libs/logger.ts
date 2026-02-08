type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function getLevel(): number {
  const env = (process.env.LETTA_LOG_LEVEL ?? "warn").toLowerCase();
  return LEVELS[env as LogLevel] ?? LEVELS.warn;
}

export function createLogger(scope: string) {
  const prefix = `[${scope}]`;
  return {
    debug: (...args: unknown[]) => { if (getLevel() <= 0) console.debug(prefix, ...args); },
    info:  (...args: unknown[]) => { if (getLevel() <= 1) console.log(prefix, ...args); },
    warn:  (...args: unknown[]) => { if (getLevel() <= 2) console.warn(prefix, ...args); },
    error: (...args: unknown[]) => { if (getLevel() <= 3) console.error(prefix, ...args); },
  };
}
