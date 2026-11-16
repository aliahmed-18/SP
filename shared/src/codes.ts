/** Join codes: 5 chars, no look-alikes (no 0/O/1/I). Unique among LIVE sessions (enforced by the server + DB). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
export const CODE_REGEX = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Uniform random code. `randomInt(n)` must return an integer in [0, n). Defaults to the Web Crypto API. */
export function generateJoinCode(randomInt: (n: number) => number = cryptoRandomInt): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Normalise what a student typed: trim, uppercase, drop spaces/dashes. */
export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

export function isValidJoinCode(input: string): boolean {
  return CODE_REGEX.test(input);
}

function cryptoRandomInt(n: number): number {
  // Rejection sampling avoids modulo bias.
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    const v = buf[0]!;
    if (v < limit) return v % n;
  }
}
