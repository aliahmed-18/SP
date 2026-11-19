/** Join link for a code (what the QR opens). */
export const joinUrl = (code: string, origin = window.location.origin) => `${origin}/join/${code}`;

/** Open (or focus) the projector window for a session. */
export function openPresentWindow(code: string) {
  window.open(`/s/${code}/present`, `getit-present-${code}`);
}
