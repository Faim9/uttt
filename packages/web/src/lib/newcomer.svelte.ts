/**
 * Whether to invite the visitor to "Learn to play": until they finish the lessons or dismiss the invitation.
 * Not a timer, since a new account doesn't mean someone knows the rules. Remembered in this browser only.
 */

const KEY = 'learned';

export const newcomer = $state({ show: false });

/** Call once in the browser, from the layout. */
export function loadNewcomer(): void {
  try {
    newcomer.show = localStorage.getItem(KEY) === null;
  } catch {
    newcomer.show = true; // Blocked storage: better to keep offering the lessons.
  }
}

/** The lessons are done (or the visitor said they know the rules): stop inviting. */
export function learned(): void {
  newcomer.show = false;
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // The invitation comes back on the next visit.
  }
}
