<script lang="ts">
  import { page } from '$app/state';
  import { CATEGORIES, type Category, type GameState, type Player } from '@uttt/core';
  import { playerName, resultText } from '#lib/game.ts';
  import { api } from '#lib/session.svelte.ts';

  interface Profile {
    username: string;
    createdAt: string;
    ratings: Record<Category, { rating: number; provisional: boolean; games: number }>;
    games: GameState[];
  }

  const username = $derived(page.params.username ?? '');
  let profile = $state<Profile | null>(null);
  let error = $state('');

  $effect(() => {
    profile = null;
    api<Profile>('GET', `/api/users/${encodeURIComponent(username)}`)
      .then((loaded) => (profile = loaded))
      .catch((e: Error) => (error = e.message));
  });

  /** The side this profile's player had in `game`. */
  const sideOf = (game: GameState, name: string): Player =>
    game.players.x.username?.toLowerCase() === name.toLowerCase() ? 'x' : 'o';

  function outcomeFor(game: GameState, side: Player): 'win' | 'loss' | 'draw' {
    if (game.outcome === 'draw') return 'draw';
    return game.outcome === side ? 'win' : 'loss';
  }
</script>

{#if profile}
  <h1>{profile.username}</h1>
  <p class="muted">Joined {new Date(profile.createdAt).toLocaleDateString()}</p>

  <div class="ratings">
    {#each CATEGORIES as category (category)}
      {@const rating = profile.ratings[category]}
      <div class="card">
        <h2>{category}</h2>
        <strong>{rating.rating}{rating.provisional ? '?' : ''}</strong>
        <span class="muted">{rating.games} {rating.games === 1 ? 'game' : 'games'}</span>
      </div>
    {/each}
  </div>

  <section class="card">
    <h2>Recent games</h2>
    {#if profile.games.length === 0}
      <p class="muted">No games yet.</p>
    {:else}
      <ul class="games">
        {#each profile.games as game (game.id)}
          {@const side = sideOf(game, profile.username)}
          {@const opponent = game.players[side === 'x' ? 'o' : 'x']}
          <li>
            <a href="/game/{game.id}">
              <span class="result {game.outcome ? outcomeFor(game, side) : ''}">
                {game.outcome ? outcomeFor(game, side) : '…'}
              </span>
              <span>vs {playerName(opponent)}</span>
              <span class="muted">{game.timeControl} · {game.rated ? 'rated' : 'casual'}</span>
              <span class="muted">{resultText(game)}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{:else}
  <p class="muted">{error || 'Loading…'}</p>
{/if}

<style>
  h1 {
    margin: 0;
  }

  .ratings {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.75rem;
    margin: 1.5rem 0;
  }

  .ratings strong {
    display: block;
    font-size: 1.75rem;
  }

  .games {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .games a {
    display: grid;
    grid-template-columns: 3.5rem 1fr auto;
    gap: 0 1rem;
    padding: 0.5rem 0;
    border-top: 1px solid var(--border);
    color: inherit;
    text-decoration: none;
  }

  .games a:hover {
    background: var(--bg);
  }

  .games a > :last-child {
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
</style>
