<script lang="ts">
  import type { IncomingChallenge } from '@uttt/core';
  import { timeControlName } from './game.ts';
  import { socket } from './session.svelte.ts';
  import { playSound } from './sound.svelte.ts';

  /** Challenges sent to you directly, on whatever page you're on; accepting starts the game. */
  let challenges = $state<IncomingChallenge[]>([]);

  $effect(() =>
    socket.listen((message) => {
      if (message.type === 'challenge') {
        challenges = [...challenges, message.challenge];
        playSound('board');
      } else if (message.type === 'challengeGone') {
        challenges = challenges.filter((challenge) => challenge.id !== message.id);
      }
    }),
  );

  function answer(challenge: IncomingChallenge, accept: boolean) {
    socket.send({ type: accept ? 'acceptChallenge' : 'declineChallenge', id: challenge.id });
    challenges = challenges.filter((other) => other !== challenge);
  }

  /** The challenger picked a side; you get the other one. */
  const yourSide = ({ color }: IncomingChallenge) =>
    color === 'random' ? 'a random side' : color === 'x' ? 'O' : 'X';
</script>

{#if challenges.length > 0}
  <aside class="incoming" aria-label="Challenges for you">
    {#each challenges as challenge (challenge.id)}
      <div class="card challenge" role="alert">
        <p>
          <strong>{challenge.from ?? 'Someone'}</strong>
          {#if challenge.bot}<span class="bot-tag">BOT</span>{/if}
          challenges you
        </p>
        <p class="muted">
          {timeControlName(challenge.timeControl)} · {challenge.rated ? 'rated' : 'casual'} · you play
          {yourSide(challenge)}
        </p>
        <div class="actions">
          <button class="button primary" onclick={() => answer(challenge, true)}>Accept</button>
          <button class="button" onclick={() => answer(challenge, false)}>Decline</button>
        </div>
      </div>
    {/each}
  </aside>
{/if}

<style>
  .incoming {
    position: fixed;
    top: 4.5rem;
    right: 1rem;
    z-index: 30;
    display: grid;
    gap: 0.5rem;
    width: min(22rem, calc(100vw - 2rem));
  }

  .challenge {
    box-shadow: var(--shadow);
    border-color: var(--accent);
  }

  .challenge p {
    margin: 0 0 0.25rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
</style>
