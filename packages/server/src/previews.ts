/**
 * Link previews. Reddit, Discord, WhatsApp and the like don't run the app: they read Open Graph tags from the
 * page's HTML. So the server fills in each page's title, description and board image before sending it.
 */

import {
  formatMove,
  formatPosition,
  initialPosition,
  isLegal,
  parseMove,
  parsePosition,
  play,
  puzzleStart,
  RATING_KINDS,
  replay,
  resultText,
  type GamePlayer,
  type Position,
} from '@uttt/core';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { boardImage } from './board-image.ts';
import type { Hub } from './hub.ts';
import { toState, type Store } from './store.ts';

interface Preview {
  title: string;
  description: string;
  /** The board in the image. */
  position: Position;
  lastMove: number | null;
}

const SITE = {
  title: 'UTTT · Ultimate Tic-Tac-Toe',
  description:
    'Play Ultimate Tic-Tac-Toe online: rated games, a strong engine, and game review. Free and open source.',
  /** A game in full swing, for pages without a board of their own. */
  position: parsePosition(
    '...ooo..x/o..o..o../..xxoox.o/.x.ooxx../xx..x..ox/x.xx...oo/..x.oox../.x..ox.xo/.xo.o.oxx o 7',
  ),
  lastMove: parseMove('3-7'),
};
/** Rendered images, kept while they're likely to be fetched again (crawlers often come in groups). */
const CACHED_IMAGES = 100;

const ImageQuery = z.object({
  position: z
    .string()
    .max(100)
    .transform((text, context) => {
      try {
        return parsePosition(text);
      } catch {
        context.addIssue({ code: 'custom', message: 'Invalid position' });
        return z.NEVER;
      }
    }),
  last: z
    .string()
    .regex(/^[1-9]-[1-9]$/)
    .optional(),
});

const named = (player: GamePlayer) =>
  player.username ? `${player.username}${player.rating ? ` (${player.rating})` : ''}` : 'Anonymous';
const kind = (rated: boolean) => (rated ? 'rated' : 'casual');

/** What a shared link to `url` shows, or the site's own preview when the page has nothing special. */
function describe(url: URL, store: Store, hub: Hub): Preview {
  const [, section = '', id = ''] = url.pathname.split('/');
  const params = url.searchParams;

  if (section === 'game') {
    const row = store.game(id);
    if (!row) return SITE;
    const game = toState(row);
    return {
      title: `${named(game.players.x)} vs ${named(game.players.o)}`,
      description: `${resultText(game)} · a ${game.timeControl} ${kind(game.rated)} game of Ultimate Tic-Tac-Toe`,
      position: replay(game.moves),
      lastMove: game.moves.at(-1) ?? null,
    };
  }
  if (section === 'puzzles') {
    const which = params.get('id') ?? '';
    const puzzle = /^\d+$/.test(which) ? store.puzzle(Number(which)) : store.dailyPuzzle();
    if (!puzzle) return SITE;
    const { position } = puzzleStart(puzzle);
    const daily = puzzle.id === store.dailyPuzzle()?.id;
    return {
      title: daily ? 'Daily puzzle · UTTT' : `Puzzle #${puzzle.id} · UTTT`,
      description: `${position.turn.toUpperCase()} to play and win. Can you find it?`,
      position,
      lastMove: null,
    };
  }
  if (section.startsWith('@')) {
    const user = store.userByName(decodeURIComponent(section.slice(1)));
    if (!user) return SITE;
    const ratings = store.ratings(user.id);
    const shown = RATING_KINDS.map((rated) => {
      const { rating, provisional } = ratings[rated];
      return `${rated === 'puzzle' ? 'Puzzles' : rated[0].toUpperCase() + rated.slice(1)} ${Math.round(rating)}${provisional ? '?' : ''}`;
    });
    return { ...SITE, title: `${user.username} · UTTT`, description: shown.join(' · ') };
  }
  if (section === 'tournaments' && id) {
    const tournament = store.tournament(id);
    if (!tournament) return SITE;
    return {
      ...SITE,
      title: `${tournament.name} · UTTT`,
      description: `A ${tournament.timeControl} ${kind(tournament.rated)} arena tournament of Ultimate Tic-Tac-Toe. Join in!`,
    };
  }
  if (section === 'challenge') {
    const challenge = hub.challenge(id);
    if (!challenge) return SITE;
    return {
      ...SITE,
      title: `${challenge.username ?? 'Someone'} challenges you to Ultimate Tic-Tac-Toe`,
      description: `A ${challenge.timeControl} ${kind(challenge.rated)} game. Open the link to play.`,
    };
  }
  if (section === 'analysis') {
    const start = params.get('position');
    let position = start ? parsePosition(start) : initialPosition;
    let lastMove = null;
    for (const text of (params.get('moves') ?? '').split(' ').filter(Boolean)) {
      lastMove = parseMove(text);
      if (!isLegal(position, lastMove)) return SITE;
      position = play(position, lastMove);
    }
    return {
      title: 'Analysis board · UTTT',
      description: 'An Ultimate Tic-Tac-Toe position to explore with the engine.',
      position,
      lastMove,
    };
  }
  return SITE;
}

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Fills the app's page (200.html) with the preview for `path`. */
export function linkPreview(store: Store, hub: Hub, publicUrl: string) {
  return (html: string, path: string): string => {
    const url = new URL(path, publicUrl);
    let preview: Preview;
    try {
      preview = describe(url, store, hub);
    } catch {
      preview = SITE; // A malformed link (bad position, bad escape): show the site instead.
    }
    const image = new URL('/api/preview.png', publicUrl);
    image.searchParams.set('position', formatPosition(preview.position));
    if (preview.lastMove !== null) image.searchParams.set('last', formatMove(preview.lastMove));
    const tags = {
      'og:site_name': 'UTTT',
      'og:type': 'website',
      'og:url': url.href,
      'og:title': preview.title,
      'og:description': preview.description,
      'og:image': image.href,
      'og:image:width': '1200',
      'og:image:height': '630',
      'twitter:card': 'summary_large_image',
    };
    const meta = Object.entries(tags)
      .map(([property, content]) => `<meta property="${property}" content="${escape(content)}" />`)
      .join('');
    return html
      .replace(/<title>[^<]*<\/title>/, `<title>${escape(preview.title)}</title>`)
      .replace(/(<meta\s+name="description"\s+content=")[^"]*/, `$1${escape(preview.description)}`)
      .replace('</head>', `${meta}</head>`);
  };
}

/** The board images that previews link to. */
export const previewRoutes = (): FastifyPluginAsync => async (app) => {
  const images = new Map<string, Buffer>();

  app.get('/api/preview.png', async (request, reply) => {
    const { position, last } = ImageQuery.parse(request.query);
    const key = `${formatPosition(position)} ${last}`;
    let png = images.get(key);
    if (!png) {
      png = boardImage(position, last ? parseMove(last) : null);
      images.set(key, png);
      const oldest = images.keys().next().value;
      if (images.size > CACHED_IMAGES && oldest) images.delete(oldest);
    }
    return reply.type('image/png').header('cache-control', 'public, max-age=86400').send(png);
  });
};
