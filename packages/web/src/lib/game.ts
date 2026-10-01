import type { GamePlayer, GameState } from '@uttt/core';

const HOW: Record<NonNullable<GameState['termination']>, string> = {
  line: 'three in a row',
  resign: 'resignation',
  timeout: 'time',
  agreement: 'agreement',
  abort: '',
};

/** E.g. "X won by resignation", "Draw by agreement", "Game aborted". */
export function resultText({ termination, outcome }: GameState): string {
  if (!termination) return 'In progress';
  if (termination === 'abort' || !outcome) return 'Game aborted';
  const how = HOW[termination];
  return outcome === 'draw' ? `Draw by ${how}` : `${outcome.toUpperCase()} won by ${how}`;
}

export function playerName(player: GamePlayer): string {
  return player.username ?? 'Anonymous';
}

/** Rating with a "?" while provisional, e.g. "1500?". */
export function ratingText(player: GamePlayer): string {
  if (player.rating === null) return '';
  return `${player.rating}${player.provisional ? '?' : ''}`;
}

/** m:ss, with tenths in the last 10 seconds. */
export function formatClock(ms: number): string {
  if (ms < 10_000) return (ms / 1000).toFixed(1);
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
