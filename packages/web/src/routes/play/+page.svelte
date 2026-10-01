<script lang="ts">
  import { categoryOf, TIME_CONTROLS, type Player, type TimeControl } from '@uttt/core';
  import { session, socket } from '#lib/session.svelte.ts';

  let rated = $state(false);
  let seeking = $state<TimeControl | null>(null);
  let challenge = $state({
    timeControl: '5+3' as TimeControl,
    color: 'random' as Player | 'random',
  });
  let challengeLink = $state<string | null>(null);
  let error = $state('');
  let copied = $state(false);

  const canRate = $derived(session.user !== null);

  $effect(() => {
    if (!canRate) rated = false;
  });

  // The server forgets seeks and challenges when the connection drops or we leave the page.
  $effect(() => {
    if (!socket.connected) {
      seeking = null;
      challengeLink = null;
    }
  });
  $effect(() => () => {
    socket.send({ type: 'cancelSeek' });
    socket.send({ type: 'cancelChallenge' });
  });

  $effect(() =>
    socket.listen((message) => {
      if (message.type === 'challengeCreated') {
        challengeLink = `${location.origin}/challenge/${message.id}`;
      } else if (message.type === 'error') {
        error = message.message;
        seeking = null;
      }
    }),
  );

  function seek(timeControl: TimeControl) {
    error = '';
    if (seeking === timeControl) {
      socket.send({ type: 'cancelSeek' });
      seeking = null;
    } else {
      socket.send({ type: 'seek', timeControl, rated });
      seeking = timeControl;
    }
  }

  function createChallenge() {
    error = '';
    socket.send({ type: 'createChallenge', rated, ...challenge });
  }

  function cancelChallenge() {
    socket.send({ type: 'cancelChallenge' });
    challengeLink = null;
  }

  async function copyLink() {
    if (!challengeLink) return;
    await navigator.clipboard.writeText(challengeLink);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<h1>Play online</h1>

<label class="rated" title={canRate ? '' : 'Sign in to play rated games'}>
  <input type="checkbox" bind:checked={rated} disabled={!canRate} />
  Rated
  {#if !canRate}<span class="muted">— <a href="/login">sign in</a> to play rated games</span>{/if}
</label>

{#if error}
  <p class="card error" role="alert">{error}</p>
{/if}

<section>
  <h2 class="section-title">Quick pairing</h2>
  <div class="pools">
    {#each TIME_CONTROLS as timeControl (timeControl)}
      <button
        class="card pool"
        class:active={seeking === timeControl}
        disabled={!socket.connected}
        onclick={() => seek(timeControl)}
      >
        <strong>{timeControl}</strong>
        <span class="muted">
          {seeking === timeControl ? 'Searching… click to cancel' : categoryOf(timeControl)}
        </span>
      </button>
    {/each}
  </div>
</section>

<section class="card friend">
  <h2>Play a friend</h2>
  {#if challengeLink}
    <p>Send this link to your opponent. The game starts when they open it.</p>
    <div class="link-row">
      <input readonly value={challengeLink} aria-label="Challenge link" />
      <button class="button primary" onclick={copyLink}>{copied ? 'Copied!' : 'Copy'}</button>
      <button class="button" onclick={cancelChallenge}>Cancel</button>
    </div>
  {:else}
    <div class="options">
      <label>
        Time
        <select bind:value={challenge.timeControl}>
          {#each TIME_CONTROLS as timeControl (timeControl)}
            <option value={timeControl}>{timeControl}</option>
          {/each}
        </select>
      </label>
      <label>
        You play
        <select bind:value={challenge.color}>
          <option value="random">Random</option>
          <option value="x">X (first)</option>
          <option value="o">O (second)</option>
        </select>
      </label>
      <button class="button primary" disabled={!socket.connected} onclick={createChallenge}>
        Create challenge link
      </button>
    </div>
  {/if}
</section>

{#if !socket.connected && session.ready}
  <p class="muted">Connecting…</p>
{/if}

<style>
  h1 {
    margin-top: 0;
  }

  .rated {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 1rem;
  }

  .section-title {
    font-size: 1rem;
  }

  .pools {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .pool {
    display: grid;
    gap: 0.25rem;
    justify-items: center;
    padding: 1.25rem 0.5rem;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }

  .pool strong {
    font-size: 1.6rem;
  }

  .pool:hover:enabled,
  .pool.active {
    border-color: var(--accent);
  }

  .pool.active {
    background: var(--last);
  }

  .options,
  .link-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: end;
  }

  .options label {
    display: grid;
    gap: 0.25rem;
  }

  select,
  .link-row input {
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }

  .link-row input {
    flex: 1;
    min-width: 12rem;
  }

  .error {
    border-color: var(--o);
  }
</style>
