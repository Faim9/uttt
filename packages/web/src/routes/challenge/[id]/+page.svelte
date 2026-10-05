<script lang="ts">
  import { page } from '$app/state';
  import type { Player, TimeControl } from '@uttt/core';
  import { timeControlName } from '#lib/game.ts';
  import { api, socket } from '#lib/session.svelte.ts';

  interface Challenge {
    username: string | null;
    timeControl: TimeControl;
    rated: boolean;
    color: Player | 'random';
  }

  const id = $derived(page.params.id ?? '');
  let challenge = $state<Challenge | null>(null);
  let error = $state('');

  $effect(() => {
    api<Challenge>('GET', `/api/challenges/${id}`)
      .then((loaded) => (challenge = loaded))
      .catch((e: Error) => (error = e.message));
  });

  $effect(() =>
    socket.listen((message) => {
      if (message.type === 'error') error = message.message;
    }),
  );

  /** The challenger picked their color; the accepter gets the other one. */
  function yourColor({ color }: Challenge): string {
    if (color === 'random') return 'a random side';
    return color === 'x' ? 'O (second)' : 'X (first)';
  }
</script>

<section class="card">
  {#if challenge}
    <h1>{challenge.username ?? 'An anonymous player'} challenges you</h1>
    <p>
      <strong>{timeControlName(challenge.timeControl)}</strong> · {challenge.rated
        ? 'Rated'
        : 'Casual'} · you play
      {yourColor(challenge)}
    </p>
    <button
      class="button primary"
      disabled={!socket.connected}
      onclick={() => socket.send({ type: 'acceptChallenge', id })}>Accept</button
    >
    <a class="button" href="/">Decline</a>
  {/if}
  {#if error}
    <p class="error" role="alert">{error}</p>
  {:else if !challenge}
    <p class="muted">Loading challenge…</p>
  {/if}
</section>

<style>
  section {
    max-width: 30rem;
    margin: 2rem auto;
    text-align: center;
  }

  h1 {
    margin-top: 0;
    font-size: 1.4rem;
  }

  .error {
    color: var(--o);
  }
</style>
