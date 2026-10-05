<script lang="ts">
  import { CATEGORIES, type GameState, type Player } from '@uttt/core';
  import { playerName, resultText, timeControlName } from './game.ts';
  import { t } from './i18n.svelte.ts';
  import { api } from './session.svelte.ts';

  /** Every game a player played, newest first, with filters and a page at a time. */
  let { username }: { username: string } = $props();

  type Listed = GameState & { createdAt: string };
  interface Page {
    total: number;
    games: Listed[];
    /** Where the next page starts, or null on the last page. */
    next: number | null;
  }

  let category = $state('');
  let rated = $state('');
  let result = $state('');
  let opponent = $state('');
  let games = $state.raw<Listed[]>([]);
  let total = $state<number | null>(null);
  let next = $state<number | null>(null);
  let loading = $state(false);

  const query = $derived(
    new URLSearchParams(
      Object.entries({ category, rated, result, opponent: opponent.trim() }).filter(
        ([, value]) => value !== '',
      ),
    ),
  );

  async function load(from: number | null) {
    loading = true;
    const before = from === null ? '' : `&before=${from}`;
    try {
      const page = await api<Page>(
        'GET',
        `/api/users/${encodeURIComponent(username)}/games?${query}${before}`,
      );
      games = from === null ? page.games : [...games, ...page.games];
      total = page.total;
      next = page.next;
    } finally {
      loading = false;
    }
  }

  // The first page reloads whenever the player or a filter changes.
  $effect(() => {
    void query;
    void username;
    load(null);
  });

  const sideOf = (game: GameState): Player =>
    game.players.x.username?.toLowerCase() === username.toLowerCase() ? 'x' : 'o';

  function outcomeFor(game: GameState, side: Player): 'win' | 'loss' | 'draw' {
    if (game.outcome === 'draw') return 'draw';
    return game.outcome === side ? 'win' : 'loss';
  }
</script>

<section class="card">
  <h2>{t('history.title')}{total === null ? '' : ` (${total})`}</h2>
  <div class="filters">
    <select bind:value={category} aria-label={t('time.control')}>
      <option value="">{t('history.allTimeControls')}</option>
      {#each CATEGORIES as value (value)}
        <option {value}>{t(`category.${value}`)}</option>
      {/each}
    </select>
    <select bind:value={rated} aria-label={t('history.ratedOrCasual')}>
      <option value="">{t('history.ratedAndCasual')}</option>
      <option value="true">{t('game.rated')}</option>
      <option value="false">{t('game.casual')}</option>
    </select>
    <select bind:value={result} aria-label={t('history.result')}>
      <option value="">{t('history.allResults')}</option>
      <option value="win">{t('history.wins')}</option>
      <option value="loss">{t('history.losses')}</option>
      <option value="draw">{t('history.draws')}</option>
    </select>
    <!-- Applies on Enter or leaving the field, not on every keystroke. -->
    <input
      value={opponent}
      onchange={(event) => (opponent = event.currentTarget.value)}
      placeholder={t('history.opponent')}
      aria-label={t('history.opponentName')}
    />
  </div>

  {#if total === 0}
    <p class="muted">{t(query.size > 0 ? 'history.noMatch' : 'history.none')}</p>
  {:else}
    <ul class="games">
      {#each games as game (game.id)}
        {@const side = sideOf(game)}
        <li>
          <a href="/game/{game.id}">
            <span class="result {game.outcome ? outcomeFor(game, side) : ''}">
              {t(game.outcome ? `history.${outcomeFor(game, side)}` : 'history.playing')}
            </span>
            <span>{t('game.vs', { name: playerName(game.players[side === 'x' ? 'o' : 'x']) })}</span
            >
            <span class="muted">{new Date(game.createdAt).toLocaleDateString()}</span>
            <span class="muted details">
              {timeControlName(game.timeControl)} · {game.rated ? 'rated' : 'casual'} ·
              {resultText(game)}
            </span>
          </a>
        </li>
      {/each}
    </ul>
    {#if next !== null}
      <button class="button more" disabled={loading} onclick={() => load(next)}
        >{t('history.more')}</button
      >
    {/if}
  {/if}
</section>

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .filters select,
  .filters input {
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
  }

  .filters input {
    width: 9rem;
  }

  .games {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .games a {
    display: grid;
    grid-template-columns: 4.5rem 1fr auto;
    gap: 0 1rem;
    padding: 0.5rem 0;
    border-top: 1px solid var(--border);
    color: inherit;
    text-decoration: none;
  }

  .games a:hover {
    background: var(--bg);
  }

  .details {
    grid-column: 2 / -1;
    font-size: 0.85rem;
  }

  .result {
    font-weight: 700;
    text-transform: capitalize;
  }

  .win {
    color: var(--hint);
  }

  .loss {
    color: var(--o);
  }

  .more {
    margin-top: 0.75rem;
  }
</style>
