/**
 * Rating-based pairing, after lichess's pool matchmaking (lila, modules/pool/MatchMaking.scala, AGPL-3.0).
 * A pairing's score is the rating gap, minus bonuses for time spent waiting and for both players being
 * provisional. Pairings scoring above a limit aren't allowed, so the accepted gap widens as players wait.
 */

export interface PoolMember {
  /** Players can't be paired with themselves (e.g. seeking from two tabs). */
  key: string;
  rating: number;
  provisional: boolean;
  /** Pairing waves this member has waited through unpaired. */
  misses: number;
}

/** Above this score no pairing is allowed: about 100–130 points at first, wider for strong players. */
const maxScore = (rating: number) => (rating < 1000 ? 130 : rating < 1500 ? 100 : rating / 15);

/** Grows 12 points per missed wave, up to 460. */
const waitBonus = (member: PoolMember) => Math.min(member.misses * 12, 460);

/** Lower is better; null means the pair may not play. */
export function pairScore(a: PoolMember, b: PoolMember): number | null {
  if (a.key === b.key) return null;
  const score =
    Math.abs(a.rating - b.rating) -
    Math.min(waitBonus(a), waitBonus(b)) -
    (a.provisional && b.provisional ? 30 : 0);
  return score <= maxScore(Math.min(a.rating, b.rating)) ? score : null;
}

/**
 * Pairs members, best pairings first. Lichess solves this as a weighted matching; picking the best remaining
 * pair greedily gives the same result for pools as small as ours.
 */
export function matchmake<T extends PoolMember>(members: T[]): [T, T][] {
  const candidates: { a: T; b: T; score: number }[] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const score = pairScore(members[i], members[j]);
      if (score !== null) candidates.push({ a: members[i], b: members[j], score });
    }
  }
  candidates.sort((p, q) => p.score - q.score);

  const paired = new Set<T>();
  const pairs: [T, T][] = [];
  for (const { a, b } of candidates) {
    if (paired.has(a) || paired.has(b)) continue;
    paired.add(a).add(b);
    pairs.push([a, b]);
  }
  return pairs;
}
