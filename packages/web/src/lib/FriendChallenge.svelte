<script lang="ts">
  import { isTimeControl, TIME_CONTROLS, type Player } from '@uttt/core';
  import { socket } from './session.svelte.ts';

  /** A dialog that creates a challenge link; the game starts when the friend opens it. */
  let { rated }: { rated: boolean } = $props();

  let dialog: HTMLDialogElement;
  let minutes = $state(5);
  let increment = $state(3);
  const timeControl = $derived(`${minutes}+${increment}`);
  let color = $state<Player | 'random'>('random');
  let link = $state<string | null>(null);
  let creating = $state(false);
  let error = $state('');
  let copied = $state(false);

  export function open() {
    error = '';
    dialog.showModal();
  }

  $effect(() =>
    socket.listen((message) => {
      if (message.type === 'challengeCreated') {
        link = `${location.origin}/challenge/${message.id}`;
        creating = false;
      } else if (message.type === 'error' && creating) {
        error = message.message;
        creating = false;
      }
    }),
  );

  // The server forgets challenges when the connection drops or we leave the page.
  $effect(() => {
    if (!socket.connected) link = null;
  });
  $effect(() => () => socket.send({ type: 'cancelChallenge' }));

  function create() {
    error = '';
    if (!isTimeControl(timeControl)) return;
    creating = true;
    socket.send({ type: 'createChallenge', timeControl, color, rated });
  }

  /** Closing the dialog withdraws the challenge, so a stale link can't start a game later. */
  function closed() {
    if (link) socket.send({ type: 'cancelChallenge' });
    link = null;
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<dialog bind:this={dialog} onclose={closed} aria-labelledby="friend-title">
  <h2 id="friend-title">Play a friend</h2>
  {#if link}
    <p>Send this link to your friend. The game starts as soon as they open it.</p>
    <div class="row">
      <input readonly value={link} aria-label="Challenge link" />
      <button class="button primary" onclick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
    </div>
    <p class="muted waiting">Waiting for your friend…</p>
  {:else}
    <fieldset>
      <legend>Time control</legend>
      <div class="presets">
        {#each TIME_CONTROLS as preset (preset)}
          <button
            class="button"
            aria-pressed={timeControl === preset}
            onclick={() => ([minutes, increment] = preset.split('+').map(Number))}
          >
            {preset}
          </button>
        {/each}
      </div>
      <div class="row">
        <label>
          Minutes
          <input type="number" min="1" max="60" bind:value={minutes} />
        </label>
        <label>
          Increment (seconds)
          <input type="number" min="0" max="30" bind:value={increment} />
        </label>
      </div>
      {#if !isTimeControl(timeControl)}
        <p class="error">From 1 to 60 minutes, plus 0 to 30 seconds per move.</p>
      {/if}
    </fieldset>
    <label>
      You play
      <select bind:value={color}>
        <option value="random">Random</option>
        <option value="x">X (moves first)</option>
        <option value="o">O</option>
      </select>
    </label>
    <p class="muted">{rated ? 'Rated game' : 'Casual game'}: change it on the main page.</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  {/if}
  <div class="row end">
    <button class="button" onclick={() => dialog.close()}
      >{link ? 'Cancel challenge' : 'Close'}</button
    >
    {#if !link}
      <button
        class="button primary"
        disabled={!socket.connected || creating || !isTimeControl(timeControl)}
        onclick={create}
      >
        Create link
      </button>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    width: min(26rem, calc(100vw - 2rem));
    padding: 1.25rem;
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    color: var(--text);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }

  dialog[open] {
    display: grid;
    gap: 0.9rem;
  }

  h2 {
    margin: 0;
    font-size: 1.3rem;
  }

  p {
    margin: 0;
  }

  label {
    display: grid;
    gap: 0.3rem;
    font-weight: 500;
  }

  fieldset {
    display: grid;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 0.4rem;
    padding: 0;
    font-weight: 500;
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .presets .button {
    padding: 0.3rem 0.7rem;
  }

  .presets .button[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-text);
  }

  .row label {
    flex: 1;
  }

  select,
  input {
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .row input {
    flex: 1;
    min-width: 0;
  }

  .end {
    justify-content: flex-end;
  }

  .waiting {
    animation: pulse 1.6s ease-in-out infinite;
  }

  .error {
    color: var(--blunder);
  }

  @keyframes pulse {
    50% {
      opacity: 0.45;
    }
  }
</style>
