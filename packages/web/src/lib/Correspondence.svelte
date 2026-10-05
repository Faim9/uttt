<script lang="ts">
  import { CORRESPONDENCE, type TimeControl } from '@uttt/core';
  import { formatClock, timeControlName } from './game.ts';
  import { api, session, socket } from './session.svelte.ts';

  /**
   * Correspondence play in the lobby: your games (your move first) always; when expanded, also open games
   * to accept and new ones to post. Nobody needs to be online at the same time, which suits a small site.
   */
  let { rated, expanded }: { rated: boolean; expanded: boolean } = $props();

  const REFRESH_MS = 15_000;

  interface Lists {
    open: {
      id: string;
      username: string;
      rating: number;
      provisional: boolean;
      timeControl: TimeControl;
      rated: boolean;
    }[];
    mine: { id: string; timeControl: TimeControl; rated: boolean; listed: boolean }[];
    games: { id: string; opponent: string | null; yourTurn: boolean; timeLeft: number }[];
  }

  let lists = $state<Lists>({ open: [], mine: [], games: [] });
  let error = $state('');
  /** Socket errors are only this card's business right after it accepted a game. */
  let accepting = false;

  const refresh = () =>
    api<Lists>('GET', '/api/correspondence').then(
      (loaded) => (lists = loaded),
      () => {}, // A missed refresh is fine; the next one catches up.
    );

  // Reloads when the session arrives (signed-in players see their own games), then every few seconds.
  $effect(() => {
    void session.user;
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  });

  $effect(() =>
    socket.listen((message) => {
      if (message.type === 'error' && accepting) error = message.message;
      accepting = false;
    }),
  );

  async function post(timeControl: TimeControl) {
    error = '';
    try {
      await api('POST', '/api/correspondence', {
        timeControl,
        rated,
        color: 'random',
        listed: true,
      });
      await refresh();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function cancel(id: string) {
    await api('POST', `/api/correspondence/${id}/cancel`);
    await refresh();
  }

  /** Accepting starts the game; the layout then takes you to it. */
  function accept(id: string) {
    error = '';
    accepting = true;
    socket.send({ type: 'acceptChallenge', id });
  }
</script>

{#if expanded || lists.games.length > 0}
  <section class="card correspondence">
    <h2>{expanded ? 'Correspondence' : 'Your correspondence games'}</h2>
    {#if expanded}
      <p class="muted">
        Days per move: play whenever you have time, no need to be online together.
      </p>
    {/if}

    {#if lists.games.length > 0}
      <ul>
        {#each lists.games as game (game.id)}
          <li>
            <a href="/game/{game.id}">vs {game.opponent ?? 'Anonymous'}</a>
            {#if game.yourTurn}
              <strong class="turn">Your move · {formatClock(game.timeLeft)} left</strong>
            {:else}
              <span class="muted">Their move</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if expanded && lists.open.length > 0}
      <h3>Open games</h3>
      <ul>
        {#each lists.open as challenge (challenge.id)}
          <li>
            <span>
              <a href="/@{challenge.username}">{challenge.username}</a>
              <span class="muted">{challenge.rating}{challenge.provisional ? '?' : ''}</span>
            </span>
            <span class="muted"
              >{timeControlName(challenge.timeControl)} · {challenge.rated
                ? 'rated'
                : 'casual'}</span
            >
            {#if session.user}
              <button
                class="button"
                disabled={!socket.connected}
                onclick={() => accept(challenge.id)}>Accept</button
              >
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if expanded && session.user}
      {#if lists.mine.length > 0}
        <h3>Your open games</h3>
        <ul>
          {#each lists.mine as challenge (challenge.id)}
            <li>
              <span class="muted">
                {timeControlName(challenge.timeControl)} · {challenge.rated ? 'rated' : 'casual'}
                · {challenge.listed ? 'waiting for an opponent' : 'shared by link'}
              </span>
              <button class="button" onclick={() => cancel(challenge.id)}>Cancel</button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="new" role="group" aria-label="Start a correspondence game">
        <span class="muted">New game:</span>
        {#each CORRESPONDENCE as timeControl (timeControl)}
          <button class="button" onclick={() => post(timeControl)}>
            {timeControlName(timeControl).replace(' per move', '')}
          </button>
        {/each}
      </div>
    {:else if expanded && session.ready}
      <p class="muted"><a href="/login">Sign in</a> to play correspondence games.</p>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </section>
{/if}

<style>
  h2 {
    margin: 0;
  }

  h3 {
    margin: 0.75rem 0 0.25rem;
    font-size: 0.95rem;
  }

  ul {
    display: grid;
    gap: 0.35rem;
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    align-items: center;
  }

  li > :last-child {
    margin-left: auto;
  }

  .turn {
    color: var(--hint);
  }

  .new {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .error {
    color: var(--blunder);
  }
</style>
