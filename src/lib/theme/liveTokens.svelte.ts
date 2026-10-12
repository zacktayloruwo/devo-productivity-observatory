// The resolved colour tokens as one shared reactive value: read on first
// use, re-read whenever the theme may have changed.
import { readTokens, onThemeChange, type Tokens } from './tokens';

let current: Tokens | null = null;
let version = $state(0);

export const liveTokens = {
  get value(): Tokens {
    void version;
    if (!current) {
      current = readTokens();
      onThemeChange(() => { current = readTokens(); version = version + 1; });
    }
    return current;
  }
};
