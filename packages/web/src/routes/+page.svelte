<script lang="ts">
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { categoryOf, TIME_CONTROLS, type PoolTimeControl } from '@uttt/core';
  import { onMount } from 'svelte';
  import DemoBoard from '#lib/DemoBoard.svelte';
  import FollowingList from '#lib/Following.svelte';
  import FriendChallenge from '#lib/FriendChallenge.svelte';
  import { search, startSearch, stopSearch } from '#lib/search.svelte.ts';
  import { api, session, socket } from '#lib/session.svelte.ts';
  import { phaseOf, timing, type Tournament } from '#lib/tournament.ts';

  let rated = $state(search.rated);
  let now = $state(Date.now());
  let friend: FriendChallenge | undefined = $state();
  /** Players in games, and players waiting per pool (`3+2`, `3+2 rated`), refreshed every few seconds. */
  let activity = $state<{ playing: number; seeking: Record<string, number> }>({
    playing: 0,
    seeking: {},
  });

  /** The running tournament, or the next one within a week, to feature in the lobby. */
  let featured = $state<Tournament | null>(null);

  const ALONE_MS = 20_000;
  const ACTIVITY_MS = 3000;

  /** Why rated play is unavailable, if it is (unknown until the session has loaded). */
  const ratedBlocker = $derived(
    !session.ready
      ? null
      : !session.user
        ? 'signin'
        : !session.user.emailVerified
          ? 'verify'
          : null,
  );

  $effect(() => {
    if (ratedBlocker) rated = false;
  });

  onMount(() => {
    const refresh = () =>
      api<typeof activity>('GET', '/api/lobby').then(
        (loaded) => (activity = loaded),
        () => {}, // A missed refresh is fine; the next one catches up.
      );
    refresh();
    const timers = [setInterval(refresh, ACTIVITY_MS), setInterval(() => (now = Date.now()), 1000)];
    api<{ current: Tournament[] }>('GET', '/api/tournaments').then(
      ({ current }) => {
        const soon = (t: Tournament) => Date.parse(t.startsAt) - Date.now() < 7 * 86_400_000;
        featured =
          current.find((t) => phaseOf(t, Date.now()) === 'running') ?? current.find(soon) ?? null;
      },
      () => {},
    );

    // "New opponent" after a game links here (`/?seek=3+2&rated`) to start looking straight away.
    const pool = TIME_CONTROLS.find((tc) => tc === page.url.searchParams.get('seek'));
    if (pool) {
      rated = page.url.searchParams.has('rated');
      startSearch(pool, rated);
      replaceState('/', {});
    }
    return () => timers.forEach(clearInterval);
  });

  /** Others waiting in a pool of the chosen kind, not counting you. */
  function waiting(pool: PoolTimeControl): number {
    const count = activity.seeking[rated ? `${pool} rated` : pool] ?? 0;
    return search.pool === pool && search.rated === rated ? Math.max(0, count - 1) : count;
  }

  /** "Play now" joins the pool where someone is already waiting, so players meet; 3+2 by default. */
  const busiest = $derived(
    TIME_CONTROLS.reduce<PoolTimeControl>(
      (best, pool) => (waiting(pool) > waiting(best) ? pool : best),
      '3+2',
    ),
  );
  const searchedFor = $derived(Math.floor((now - search.since) / 1000));
  /** Others looking for a game, not counting you. */
  const lookingCount = $derived(
    Object.values(activity.seeking).reduce((sum, n) => sum + n, 0) - (search.pool ? 1 : 0),
  );

  /** One click starts looking for an opponent; clicking the same time control again stops. */
  function seek(pool: PoolTimeControl) {
    if (search.pool === pool) stopSearch();
    else startSearch(pool, rated);
  }
</script>

<div class="lobby">
  <section class="intro">
    <h1>Ultimate Tic-Tac-Toe</h1>
    <p class="muted">Nine boards, one game. Every move decides where your opponent plays next.</p>
    <p class="activity">
      {#if activity.playing + lookingCount > 0}
        <span class="live" aria-hidden="true"></span>
        {activity.playing} playing · {lookingCount} looking for a game
      {:else}
        No games right now. Start one, and the next visitor plays you.
      {/if}
    </p>
  </section>

  <section class="pairing" aria-label="Quick pairing">
    <div class="mode">
      <div class="toggle" role="group" aria-label="Game type">
        <button aria-pressed={!rated} disabled={!!search.pool} onclick={() => (rated = false)}>
          Casual
        </button>
        <button
          aria-pressed={rated}
          disabled={!!search.pool || ratedBlocker !== null}
          onclick={() => (rated = true)}
        >
          Rated
        </button>
      </div>
      {#if ratedBlocker === 'signin'}
        <span class="muted"><a href="/login">Sign in</a> to play rated games</span>
      {:else if ratedBlocker === 'verify'}
        <span class="muted">Confirm your email to play rated (<a href="/account">settings</a>)</span
        >
      {/if}
    </div>

    <button
      class="button primary play-now"
      disabled={!socket.connected || search.pool !== null}
      onclick={() => startSearch(busiest, rated)}
    >
      Play now
      <span>
        {busiest} · {waiting(busiest) > 0
          ? `${waiting(busiest)} waiting`
          : 'the usual meeting point'}
      </span>
    </button>

    <div class="pools">
      {#each TIME_CONTROLS as timeControl (timeControl)}
        {@const others = waiting(timeControl)}
        <button
          class="pool"
          class:searching={search.pool === timeControl}
          disabled={!socket.connected || (search.pool !== null && search.pool !== timeControl)}
          onclick={() => seek(timeControl)}
        >
          <strong>{timeControl}</strong>
          {#if search.pool === timeControl}
            <span class="status">Searching {searchedFor}s</span>
            <span class="cancel">Click to cancel</span>
          {:else}
            <span class="status">{categoryOf(timeControl)}</span>
          {/if}
          {#if others > 0}
            <span class="badge">{others} waiting</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if search.error}
      <p class="error" role="alert">{search.error}</p>
    {:else if search.pool && now - search.since > ALONE_MS}
      <p class="alone">
        No one else is looking for {search.pool} right now.
        <a href="/computer">Play the computer while you wait</a>: you'll be taken to your game as
        soon as someone joins.
      </p>
    {:else if !socket.connected && session.ready}
      <p class="muted">Connecting…</p>
    {/if}
  </section>

  <aside class="actions">
    <nav class="ways" aria-label="Other ways to play">
      {#if featured}
        <a class="action featured" href="/tournaments/{featured.id}">
          <strong>{featured.name}</strong>
          <span>{featured.timeControl} arena · {timing(featured, now)}</span>
        </a>
      {/if}
      <button class="action" onclick={() => friend?.open()}>
        <strong>Play a friend</strong>
        <span>Send a link; the game starts when they open it</span>
      </button>
      <a class="action" href="/puzzles">
        <strong>Daily puzzle</strong>
        <span>Find the winning move; a new one every day</span>
      </a>
      <a class="action" href="/computer">
        <strong>Play the computer</strong>
        <span>Six levels, from first steps to a real fight</span>
      </a>
      <a class="action" href="/analysis">
        <strong>Analysis board</strong>
        <span>Explore any position with the engine</span>
      </a>
      <a class="action" href="/watch">
        <strong>Watch live games</strong>
        <span>See who's playing right now</span>
      </a>
    </nav>
    <FollowingList />
  </aside>
</div>

<FriendChallenge bind:this={friend} {rated} />

<section class="learn">
  <div class="card demo">
    <DemoBoard />
  </div>
  <div class="card rules">
    <h2>How to play</h2>
    <ol>
      <li>Nine small tic-tac-toe boards make one big board. X moves first.</li>
      <li>
        <strong>Where you play decides where your opponent plays:</strong> take the top-right cell of
        any board, and they must play in the top-right board. It's highlighted for them.
      </li>
      <li>If that board is already won or full, they may play anywhere.</li>
      <li>Three in a row wins a small board. Three small boards in a row wins the game.</li>
    </ol>
    <p class="muted">
      Moves are written <strong>board-cell</strong>, both numbered 1–9 like a phone keypad:
      <code>5-3</code> is the center board, top-right cell.
    </p>
    <a class="button primary" href="/computer">Try it against the computer</a>
  </div>
</section>

<style>
  .lobby {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 17rem;
    grid-template-areas:
      'intro actions'
      'pairing actions';
    grid-template-rows: auto 1fr;
    gap: 1.25rem 1.5rem;
    margin-bottom: 2.5rem;
  }

  .intro {
    grid-area: intro;
  }

  h1 {
    margin: 0.5rem 0 0.25rem;
    font-size: clamp(2rem, 5vw, 3rem);
    line-height: 1.1;
  }

  .intro p {
    margin: 0;
    font-size: 1.1rem;
  }

  .pairing {
    grid-area: pairing;
    display: grid;
    gap: 0.9rem;
    align-content: start;
  }

  .mode {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
  }

  .toggle {
    display: inline-flex;
    padding: 3px;
    border: var(--border-width) solid var(--border);
    border-radius: 999px;
    background: var(--surface);
  }

  .toggle button {
    padding: 0.3rem 1rem;
    border: 0;
    border-radius: 999px;
    background: none;
    font-weight: 500;
    cursor: pointer;
  }

  .toggle button[aria-pressed='true'] {
    background: var(--accent);
    color: var(--accent-text);
  }

  .toggle button:disabled:not([aria-pressed='true']) {
    opacity: 0.45;
    cursor: default;
  }

  .activity {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin: 0.5rem 0 0;
    font-weight: 500;
  }

  .live {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--hint);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }

  .play-now {
    display: grid;
    padding: 0.8rem 1rem;
    font-size: 1.2rem;
    font-weight: 700;
    text-align: center;
  }

  .play-now span {
    font-size: 0.85rem;
    font-weight: 400;
    opacity: 0.85;
  }

  .badge {
    margin-top: 0.25rem;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--hint) 18%, transparent);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .alone {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-left: 4px solid var(--accent);
    border-radius: 4px;
    background: var(--surface);
  }

  .pools {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  .pool {
    display: grid;
    gap: 0.15rem;
    justify-items: center;
    align-content: center;
    min-height: 7.5rem;
    padding: 1rem 0.5rem;
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow), var(--depth);
    cursor: pointer;
    transition:
      transform 0.15s,
      border-color 0.15s,
      opacity 0.15s;
  }

  .pool strong {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: var(--display-weight);
    line-height: 1.1;
  }

  .pool .status {
    color: var(--muted);
    text-transform: capitalize;
  }

  .pool:hover:enabled {
    border-color: var(--accent);
    transform: translateY(-2px);
  }

  .pool:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .pool.searching {
    border-color: var(--accent);
    animation: searching 1.6s ease-in-out infinite;
  }

  .pool.searching .status {
    color: var(--text);
    text-transform: none;
  }

  .cancel {
    font-size: 0.8rem;
    color: var(--muted);
  }

  @keyframes searching {
    50% {
      box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 25%, transparent);
    }
  }

  .error {
    margin: 0;
    color: var(--blunder);
  }

  .actions {
    grid-area: actions;
  }

  .actions,
  .ways {
    display: grid;
    gap: 0.75rem;
    align-content: start;
  }

  .action {
    display: grid;
    gap: 0.1rem;
    padding: 0.85rem 1rem;
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow), var(--depth);
    color: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition:
      transform 0.15s,
      border-color 0.15s;
  }

  .action:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
  }

  .featured {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  }

  .action strong {
    font-size: 1.05rem;
  }

  .action span {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .learn {
    display: grid;
    grid-template-columns: minmax(0, 22rem) minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }

  .rules ol {
    padding-left: 1.25rem;
  }

  .rules li {
    margin-bottom: 0.4rem;
  }

  @media (max-width: 860px) {
    .lobby {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: 'intro' 'pairing' 'actions';
    }

    .learn {
      grid-template-columns: minmax(0, 1fr);
    }

    .demo {
      max-width: 22rem;
      width: 100%;
      justify-self: center;
    }
  }
</style>
