import {
  formatMove,
  isCorrespondence,
  type GamePlayer,
  type Judgement,
  type TimeControl,
} from '@uttt/core';

export function playerName(player: GamePlayer): string {
  return player.username ?? 'Anonymous';
}

/** Rating with a "?" while provisional, e.g. "1500?". */
export function ratingText(player: GamePlayer): string {
  if (player.rating === null) return '';
  return `${player.rating}${player.provisional ? '?' : ''}`;
}

/** "3+2", or "3 days per move" for correspondence. */
export function timeControlName(timeControl: TimeControl): string {
  if (!isCorrespondence(timeControl)) return timeControl;
  const days = parseInt(timeControl);
  return `${days} ${days === 1 ? 'day' : 'days'} per move`;
}

/** m:ss, with tenths in the last 10 seconds; days and hours for correspondence clocks. */
export function formatClock(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours >= 2) return `${hours}h ${Math.floor(ms / 60_000) % 60}m`;
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
/** Opens moves in the analysis board; `game` (an online game's id) also shows its clock times. */
export function analysisLink(
  moves: number[],
  { review = false, game }: { review?: boolean; game?: string } = {},
): string {
  const params = new URLSearchParams({ moves: moves.map(formatMove).join(' ') });
  if (game) params.set('game', game);
  return `/analysis?${params}${review ? '&review' : ''}`;
}

export const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
