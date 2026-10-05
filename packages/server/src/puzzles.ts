import {
  isLegal,
  parseMove,
  play,
  PUZZLE_SLACK,
  PuzzleAttemptBody,
  puzzleStart,
  stillWins,
  type Puzzle,
} from '@uttt/core';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { signedIn, type Services } from './auth.ts';
import { DEFAULT_RATING } from './glicko.ts';
import PUZZLES from './puzzles.json' with { type: 'json' };
import type { Store } from './store.ts';

/** A first guess at each puzzle's rating from how long its win is; ratings settle as players try them. */
const FIRST_RATING: Record<number, number> = { 1: 1100, 2: 1500, 3: 1800, 4: 2000 };
/** Surer than about a new player: the length of the win is a decent guess. */
const FIRST_DEVIATION = 200;
/** The next puzzle is a random pick among this many untried puzzles rated nearest the player. */
const NEAREST = 10;

const Params = z.object({ id: z.coerce.number().int().positive() });
const Which = z.object({ which: z.enum(['daily', 'next']).or(z.coerce.number().int().positive()) });

type PuzzleRow = NonNullable<ReturnType<Store['puzzle']>>;

/** Whether a try's moves (both sides) solve the puzzle; see the attempt route. */
function judge(puzzle: Puzzle, moves: number[]): boolean {
  let { position } = puzzleStart(puzzle);
  const solver = position.turn;
  let solverMoves = 0;
  for (const move of moves) {
    if (position.outcome !== null || !isLegal(position, move)) return false;
    if (position.turn === solver) {
      const allowed = puzzle.winIn + PUZZLE_SLACK - solverMoves++;
      if (stillWins(position, move, allowed) !== true) return false;
    }
    position = play(position, move);
  }
  return position.outcome === solver;
}

/**
 * Puzzles and puzzle ratings. The browser gets the solution so moves answer instantly, but the server
 * judges the moves played and keeps the ratings; only a player's first try at a puzzle is rated.
 */
export const puzzleRoutes =
  ({ store }: Services): FastifyPluginAsync =>
  async (app) => {
    // `pnpm puzzles` regenerates the file; new puzzles join the database on the next start.
    store.addPuzzles(
      PUZZLES.map((puzzle) => ({
        ...puzzle,
        ...DEFAULT_RATING,
        rating: FIRST_RATING[puzzle.winIn],
        deviation: FIRST_DEVIATION,
      })),
    );

    /** The player's puzzle rating, and whether their try at `puzzleId` will be rated. */
    const player = (userId: number, puzzleId: number) => {
      const { rating, provisional } = store.rating(userId, 'puzzle');
      return {
        rating: Math.round(rating),
        provisional,
        rated: !store.triedPuzzle(userId, puzzleId),
      };
    };

    /** A puzzle as the visitor sees it; `you` is null for guests. */
    const view = ({ id, position, line, winIn, rating, plays }: PuzzleRow, userId?: number) => ({
      id,
      position,
      line,
      winIn,
      rating: Math.round(rating),
      plays,
      daily: id === store.dailyPuzzle()?.id,
      you: userId === undefined ? null : player(userId, id),
    });

    /** For players: an untried puzzle near their rating. For guests, any puzzle. */
    const next = (userId?: number) => {
      if (userId === undefined) return store.randomPuzzle();
      const near = store.puzzlesNear(userId, store.rating(userId, 'puzzle').rating, NEAREST);
      return near[Math.floor(Math.random() * near.length)] ?? store.randomPuzzle();
    };

    /** A puzzle by id, today's (`daily`), or the visitor's next one (`next`). */
    app.get('/api/puzzles/:which', async (request, reply) => {
      const { which } = Which.parse(request.params);
      const userId = signedIn(store, request)?.user.id;
      const puzzle =
        which === 'daily'
          ? store.dailyPuzzle()
          : which === 'next'
            ? next(userId)
            : store.puzzle(which);
      if (!puzzle) return reply.code(404).send({ error: 'No such puzzle' });
      return view(puzzle, userId);
    });

    /**
     * Judges a try: solved if the solver won, and each of their moves kept a forced win (any win counts,
     * not only the puzzle's own line, up to a little slower). The replies needn't be the best defense:
     * the solver's moves win against every reply.
     */
    app.post('/api/puzzles/:id/attempt', async (request, reply) => {
      const userId = signedIn(store, request)?.user.id;
      if (userId === undefined) return reply.code(401).send({ error: 'Sign in to rate puzzles' });
      const puzzle = store.puzzle(Params.parse(request.params).id);
      if (!puzzle) return reply.code(404).send({ error: 'No such puzzle' });
      const { moves } = PuzzleAttemptBody.parse(request.body);
      const solved = judge(puzzle, moves.map(parseMove));
      const change = store.ratePuzzle(userId, puzzle.id, solved);
      return { solved, change, puzzle: view(store.puzzle(puzzle.id) ?? puzzle, userId) };
    });
  };
