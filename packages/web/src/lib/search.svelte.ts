import type { PoolTimeControl } from '@uttt/core';
import { socket } from './session.svelte.ts';

/**
 * The quick-pairing search, kept outside any page: players can browse or play the computer while they
 * wait, and the layout takes them to the game when an opponent is found (see SearchBar.svelte).
 */
export const search = $state<{
  pool: PoolTimeControl | null;
  rated: boolean;
  since: number;
  error: string;
}>({ pool: null, rated: false, since: 0, error: '' });

/** SearchBar sends the seek, and sends it again after a reconnect. */
export function startSearch(pool: PoolTimeControl, rated: boolean): void {
  Object.assign(search, { pool, rated, since: Date.now(), error: '' });
}

export function stopSearch(): void {
  if (search.pool) socket.send({ type: 'cancelSeek' });
  search.pool = null;
}
