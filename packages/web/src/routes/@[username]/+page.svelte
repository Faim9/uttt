<script lang="ts">
  import { page } from '$app/state';
  import {
    RATING_KINDS,
    resultText,
    type GameState,
    type Player,
    type RatingKind,
  } from '@uttt/core';
  import { playerName, timeControlName } from '#lib/game.ts';
  import RatingGraph from '#lib/RatingGraph.svelte';
  import ReportDialog from '#lib/ReportDialog.svelte';
  import { api, session } from '#lib/session.svelte.ts';

  interface Profile {
    username: string;
    createdAt: string;
    closed: boolean;
    followers: number;
    /** How the signed-in viewer relates to this player. */
    following: boolean;
    blocked: boolean;
    ratings: Record<RatingKind, { rating: number; provisional: boolean; games: number }>;
    history: Record<RatingKind, { rating: number; at: string }[]>;
    games: GameState[];
  }

  const username = $derived(page.params.username ?? '');
  let profile = $state<Profile | null>(null);
  let error = $state('');
  let report: ReportDialog | undefined = $state();
  /** The rating whose graph is shown; picked by clicking it. */
  let graphed = $state<RatingKind>('blitz');
  const isMe = $derived(session.user?.username.toLowerCase() === username.toLowerCase());
  const path = $derived(`/api/users/${encodeURIComponent(username)}`);

  async function load() {
    try {
      const loaded = await api<Profile>('GET', path);
      // Start on the rating with the most rated games or puzzles.
      if (profile?.username !== loaded.username) {
        graphed = RATING_KINDS.reduce((a, b) =>
          loaded.history[b].length > loaded.history[a].length ? b : a,
        );
      }
      profile = loaded;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  $effect(() => {
    profile = null;
    load();
  });

  async function relate(action: 'follow' | 'unfollow' | 'block' | 'unblock') {
    if (
      action === 'block' &&
      !confirm(`Block ${username}? You won't be paired or play each other.`)
    ) {
      return;
    }
    await api('POST', `${path}/${action}`);
    await load();
  }

  /** The side this profile's player had in `game`. */
  const sideOf = (game: GameState, name: string): Player =>
    game.players.x.username?.toLowerCase() === name.toLowerCase() ? 'x' : 'o';

  function outcomeFor(game: GameState, side: Player): 'win' | 'loss' | 'draw' {
    if (game.outcome === 'draw') return 'draw';
    return game.outcome === side ? 'win' : 'loss';
  }
</script>

{#if profile}
  <header>
    <div>
      <h1>{profile.username}</h1>
      <p class="muted">
        Joined {new Date(profile.createdAt).toLocaleDateString()} ·
        {profile.followers}
        {profile.followers === 1 ? 'follower' : 'followers'}
      </p>
    </div>
    {#if session.user && !isMe}
      <div class="actions">
        {#if profile.blocked}
          <button class="button" onclick={() => relate('unblock')}>Unblock</button>
        {:else}
          <button
            class="button"
            class:primary={!profile.following}
            onclick={() => relate(profile?.following ? 'unfollow' : 'follow')}
          >
            {profile.following ? 'Following' : 'Follow'}
          </button>
          <button class="button" onclick={() => relate('block')}>Block</button>
        {/if}
        <button class="button" onclick={() => report?.open()}>Report</button>
      </div>
    {/if}
  </header>
  {#if profile.closed}
    <p class="card closed">This account was closed for breaking the terms of use.</p>
  {/if}
  <ReportDialog bind:this={report} username={profile.username} />

  <div class="ratings">
    {#each RATING_KINDS as kind (kind)}
      {@const rating = profile.ratings[kind]}
      {@const counted = kind === 'puzzle' ? 'puzzle' : 'game'}
      <button class="card rating" aria-pressed={graphed === kind} onclick={() => (graphed = kind)}>
        <h2>{kind === 'puzzle' ? 'puzzles' : kind}</h2>
        <strong>{rating.rating}{rating.provisional ? '?' : ''}</strong>
        <span class="muted">{rating.games} {counted}{rating.games === 1 ? '' : 's'}</span>
      </button>
    {/each}
  </div>

  <section class="card graph">
    <h2>{graphed} rating over time</h2>
    <RatingGraph points={profile.history[graphed]} />
  </section>

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
              <span class="muted"
                >{timeControlName(game.timeControl)} · {game.rated ? 'rated' : 'casual'}</span
              >
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
  header {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: start;
    justify-content: space-between;
  }

  h1 {
    margin: 0;
  }

  header p {
    margin: 0.25rem 0 0;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .closed {
    margin: 1rem 0 0;
    border-color: var(--blunder);
  }

  .ratings {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.75rem;
    margin: 1.5rem 0;
  }

  .rating {
    text-align: left;
    cursor: pointer;
  }

  .rating[aria-pressed='true'] {
    border-color: var(--accent);
  }

  .ratings strong {
    display: block;
    font-size: 1.75rem;
  }

  .graph {
    margin-bottom: 1rem;
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
