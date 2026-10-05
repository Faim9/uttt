<script lang="ts">
  import { isTimeControl, type Player } from '@uttt/core';
  import { session, socket } from './session.svelte.ts';
  import TimeControlPicker from './TimeControlPicker.svelte';

  /** Challenges one player who's online, a person or a bot; the game starts when they accept. */
  let { username, bot }: { username: string; bot: boolean } = $props();

  let dialog: HTMLDialogElement;
  let timeControl = $state('5+3');
  let color = $state<Player | 'random'>('random');
  let rated = $state(false);
  let status = $state<'choosing' | 'waiting' | 'declined'>('choosing');
  let sent: string | null = null;
  let error = $state('');

  /** Games against bots are always casual; rated play needs a confirmed email. */
  const canRate = $derived(!bot && !!session.user?.emailVerified && !session.user.bot);

  export function open() {
    status = 'choosing';
    error = '';
    dialog.showModal();
  }

  $effect(() =>
    socket.listen((message) => {
      if (status !== 'waiting') return;
      if (message.type === 'challengeCreated') sent = message.id;
      else if (message.type === 'challengeGone' && message.id === sent) status = 'declined';
      else if (message.type === 'error') {
        error = message.message;
        status = 'choosing';
      }
    }),
  );

  function send() {
    if (!isTimeControl(timeControl)) return;
    error = '';
    status = 'waiting';
    socket.send({
      type: 'challengeUser',
      username,
      timeControl,
      rated: rated && canRate,
      color,
    });
  }

  /** Closing the dialog withdraws a challenge that's still waiting. */
  function closed() {
    if (status === 'waiting') socket.send({ type: 'cancelChallenge' });
    status = 'choosing';
  }
</script>

<dialog bind:this={dialog} onclose={closed} aria-labelledby="challenge-title">
  <h2 id="challenge-title">Challenge {username}</h2>
  {#if status === 'waiting'}
    <p class="muted waiting">Waiting for {username} to accept…</p>
  {:else if status === 'declined'}
    <p>{username} declined, or is no longer available.</p>
  {:else}
    <TimeControlPicker onchange={(value) => (timeControl = value)} />
    <label>
      You play
      <select bind:value={color}>
        <option value="random">Random</option>
        <option value="x">X (moves first)</option>
        <option value="o">O</option>
      </select>
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={rated} disabled={!canRate} />
      Rated
      {#if bot}<span class="muted">(games against bots are casual)</span>{/if}
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  {/if}
  <div class="actions">
    <button class="button" onclick={() => dialog.close()}
      >{status === 'waiting' ? 'Cancel challenge' : 'Close'}</button
    >
    {#if status !== 'waiting'}
      <button
        class="button primary"
        disabled={!socket.connected || !isTimeControl(timeControl)}
        onclick={send}
      >
        {status === 'declined' ? 'Try again' : 'Send challenge'}
      </button>
    {/if}
  </div>
</dialog>

<style>
  .check {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .waiting {
    animation: pulse 1.6s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.45;
    }
  }
</style>
