<script lang="ts">
  import { categoryOf, TIME_CONTROLS, type PoolTimeControl } from '@uttt/core';
  import DemoBoard from '#lib/DemoBoard.svelte';
  import FriendChallenge from '#lib/FriendChallenge.svelte';
  import { session, socket } from '#lib/session.svelte.ts';

  let rated = $state(false);
  let seeking = $state<PoolTimeControl | null>(null);
  let seekStart = $state(0);
  let now = $state(Date.now());
  let error = $state('');
  let friend: FriendChallenge | undefined = $state();

  /** Why rated play is unavailable, if it is. */
  const ratedBlocker = $derived(
    !session.user ? 'signin' : !session.user.emailVerified ? 'verify' : null,
  );

  $effect(() => {
    if (ratedBlocker) rated = false;
  });

  // The server forgets seeks when the connection drops or we leave the page.
  $effect(() => {
    if (!socket.connected) seeking = null;
  });
  $effect(() => () => socket.send({ type: 'cancelSeek' }));

  // Ticks the "searching" time; the accepted rating gap widens as it grows.
  $effect(() => {
    if (!seeking) return;
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  $effect(() =>
    socket.listen((message) => {
      if (message.type === 'error' && seeking) {
        error = message.message;
        seeking = null;
      }
    }),
  );

  /** One click starts looking for an opponent; clicking the same time control again stops. */
  function seek(timeControl: PoolTimeControl) {
    error = '';
    if (seeking === timeControl) {
      socket.send({ type: 'cancelSeek' });
      seeking = null;
    } else {
      socket.send({ type: 'seek', timeControl, rated });
      seeking = timeControl;
      seekStart = now = Date.now();
    }
  }
</script>

<div class="lobby">
  <section class="intro">
    <h1>Ultimate Tic-Tac-Toe</h1>
    <p class="muted">Nine boards, one game. Every move decides where your opponent plays next.</p>
  </section>

  <section class="pairing" aria-label="Quick pairing">
    <div class="mode">
      <div class="toggle" role="group" aria-label="Game type">
        <button aria-pressed={!rated} disabled={!!seeking} onclick={() => (rated = false)}>
          Casual
        </button>
        <button
          aria-pressed={rated}
          disabled={!!seeking || ratedBlocker !== null}
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

    <div class="pools">
      {#each TIME_CONTROLS as timeControl (timeControl)}
        <button
          class="pool"
          class:searching={seeking === timeControl}
          disabled={!socket.connected || (seeking !== null && seeking !== timeControl)}
          onclick={() => seek(timeControl)}
        >
          <strong>{timeControl}</strong>
          {#if seeking === timeControl}
            <span class="status">Searching {Math.floor((now - seekStart) / 1000)}s</span>
            <span class="cancel">Click to cancel</span>
          {:else}
            <span class="status">{categoryOf(timeControl)}</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {:else if !socket.connected && session.ready}
      <p class="muted">Connecting…</p>
    {/if}
  </section>

  <nav class="actions" aria-label="Other ways to play">
    <button class="action" onclick={() => friend?.open()}>
      <strong>Play a friend</strong>
      <span>Send a link; the game starts when they open it</span>
    </button>
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
