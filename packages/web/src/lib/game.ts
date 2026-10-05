import {
  formatMove,
  isCorrespondence,
  type GamePlayer,
  type GameState,
  type Judgement,
  type TimeControl,
} from '@uttt/core';
import { t, tn } from './i18n.svelte.ts';

export function playerName(player: GamePlayer): string {
  return player.username ?? t('game.anonymous');
}

/** E.g. "X won by resignation", "Draw by agreement", "Game aborted", in the visitor's language. */
export function resultText({ termination, outcome }: GameState): string {
  if (!termination) return t('result.playing');
  if (termination === 'abort' || !outcome) return t('result.aborted');
  const how = t(`result.by.${termination}`);
  if (outcome === 'draw') return t('result.draw', { how });
  return t('result.won', { side: outcome.toUpperCase(), how });
}

/** Rating with a "?" while provisional, e.g. "1500?". */
export function ratingText(player: GamePlayer): string {
  if (player.rating === null) return '';
  return `${player.rating}${player.provisional ? '?' : ''}`;
}

/** "3+2", or "3 days per move" for correspondence. */
export function timeControlName(timeControl: TimeControl): string {
  return isCorrespondence(timeControl)
    ? tn('time.daysPerMove', parseInt(timeControl))
    : timeControl;
}

/** m:ss, with tenths in the last 10 seconds; days and hours for correspondence clocks. */
export function formatClock(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return t('clock.days', { d: Math.floor(hours / 24), h: hours % 24 });
  if (hours >= 2) return t('clock.hours', { h: hours, m: Math.floor(ms / 60_000) % 60 });
  if (ms < 10_000) return (ms / 1000).toFixed(1);
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The chess-style symbol after a judged move; its name is the message `judgement.<judgement>`. */
export const JUDGEMENT_SYMBOLS: Record<Judgement, string> = {
  best: '',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

/**
 * Opens moves in the analysis board: with `review`, the engine review starts right away; `game` (an
 * online game's id) also shows its clock times.
 */
export function analysisLink(
  moves: number[],
  { review = false, game }: { review?: boolean; game?: string } = {},
): string {
  const params = new URLSearchParams({ moves: moves.map(formatMove).join(' ') });
  if (game) params.set('game', game);
  return `/analysis?${params}${review ? '&review' : ''}`;
}

export const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
