/** Tiny decoupled opener for the global command palette (⌘K). */

export const COMMAND_PALETTE_OPEN_EVENT = "motormila:open-command-palette";

export function openCommandPalette(): void {
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN_EVENT));
}
