/**
 * Glicko-2 rating system, following Glickman's paper: http://www.glicko.net/glicko/glicko2.pdf
 * Ratings are updated after every game, treating each game as its own rating period.
 */

export interface Rating {
  rating: number;
  deviation: number;
  volatility: number;
}

export interface Result {
  opponent: Rating;
  /** 1 for a win, 0.5 for a draw, 0 for a loss. */
  score: number;
}

export const DEFAULT_RATING: Rating = { rating: 1500, deviation: 350, volatility: 0.06 };
/** Ratings this uncertain are shown with a "?" and kept off leaderboards. */
export const PROVISIONAL_DEVIATION = 110;
const MIN_DEVIATION = 45;
/** Constrains how fast volatility changes. */
const TAU = 0.5;
const SCALE = 173.7178;
const EPSILON = 1e-6;

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const clampDeviation = (deviation: number) =>
  Math.min(Math.max(deviation, MIN_DEVIATION), DEFAULT_RATING.deviation);

/** Uncertainty grows while a player is inactive: one rating period per day. */
export function decay(player: Rating, idleDays: number): Rating {
  const phi = player.deviation / SCALE;
  const deviation = SCALE * Math.sqrt(phi * phi + player.volatility ** 2 * idleDays);
  return { ...player, deviation: clampDeviation(deviation) };
}

export function rate(player: Rating, results: Result[]): Rating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.deviation / SCALE;
  const sigma = player.volatility;

  const terms = results.map(({ opponent, score }) => {
    const gj = g(opponent.deviation / SCALE);
    const expected = 1 / (1 + Math.exp(-gj * (mu - (opponent.rating - 1500) / SCALE)));
    return { gj, expected, score };
  });
  const v = 1 / terms.reduce((sum, t) => sum + t.gj ** 2 * t.expected * (1 - t.expected), 0);
  const improvement = terms.reduce((sum, t) => sum + t.gj * (t.score - t.expected), 0);
  const delta = v * improvement;

  // New volatility: solve f(x) = 0 with the Illinois algorithm (step 5 of the paper).
  const a = Math.log(sigma * sigma);
  const f = (x: number) =>
    (Math.exp(x) * (delta ** 2 - phi ** 2 - v - Math.exp(x))) /
      (2 * (phi ** 2 + v + Math.exp(x)) ** 2) -
    (x - a) / TAU ** 2;
  let lower = a;
  let upper = delta ** 2 > phi ** 2 + v ? Math.log(delta ** 2 - phi ** 2 - v) : a - TAU;
  if (delta ** 2 <= phi ** 2 + v) while (f(upper) < 0) upper -= TAU;
  let fLower = f(lower);
  let fUpper = f(upper);
  while (Math.abs(upper - lower) > EPSILON) {
    const next = lower + ((lower - upper) * fLower) / (fUpper - fLower);
    const fNext = f(next);
    if (fNext * fUpper <= 0) {
      lower = upper;
      fLower = fUpper;
    } else {
      fLower /= 2;
    }
    upper = next;
    fUpper = fNext;
  }
  const volatility = Math.exp(lower / 2);

  const phiStar = Math.sqrt(phi ** 2 + volatility ** 2);
  const newPhi = 1 / Math.sqrt(1 / phiStar ** 2 + 1 / v);
  return {
    rating: SCALE * (mu + newPhi ** 2 * improvement) + 1500,
    deviation: clampDeviation(SCALE * newPhi),
    volatility,
  };
}
