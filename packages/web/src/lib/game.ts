import { formatMove, type GamePlayer, type GameState, type Judgement } from '@uttt/core';

const HOW: Record<NonNullable<GameState['termination']>, string> = {
  line: 'three in a row',
  resign: 'resignation',
  timeout: 'time',
  agreement: 'agreement',
  abort: '',
  disconnect: 'abandonment',
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

/** How each judgement is shown: chess-style symbols after the move, and a label. */
export const JUDGEMENTS: Record<Judgement, { label: string; plural: string; symbol: string }> = {
  best: { label: 'best move', plural: 'best moves', symbol: '' },
  good: { label: 'good move', plural: 'good moves', symbol: '' },
  inaccuracy: { label: 'inaccuracy', plural: 'inaccuracies', symbol: '?!' },
  mistake: { label: 'mistake', plural: 'mistakes', symbol: '?' },
  blunder: { label: 'blunder', plural: 'blunders', symbol: '??' },
};

/** Opens the moves on the analysis board; with `review`, the engine review starts right away. */
export function analysisLink(moves: number[], { review = false } = {}): string {
  const params = new URLSearchParams({ moves: moves.map(formatMove).join(' ') });
  return `/analysis?${params}${review ? '&review' : ''}`;
}

export const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** Today's puzzle is the same for everyone: days since 1970 (UTC), wrapped around the list. */
export const dailyPuzzle = (count: number) => Math.floor(Date.now() / 86_400_000) % count;
