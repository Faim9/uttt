<script lang="ts">
  import { page } from '$app/state';
  import type { Player, TimeControl } from '@uttt/core';
  import { timeControlName } from '#lib/game.ts';
  import { t } from '#lib/i18n.svelte.ts';
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
    if (color === 'random') return t('incoming.randomSide');
    return t(color === 'x' ? 'computer.o' : 'computer.x');
  }
</script>

<section class="card">
  {#if challenge}
    <h1>
      {t('challengePage.title', { name: challenge.username ?? t('challengePage.anonymous') })}
    </h1>
    <p>
      <strong>{timeControlName(challenge.timeControl)}</strong> · {t(
        challenge.rated ? 'game.rated' : 'game.casual',
      )} · {t('incoming.youPlay', { side: yourColor(challenge) })}
    </p>
    <button
      class="button primary"
      disabled={!socket.connected}
      onclick={() => socket.send({ type: 'acceptChallenge', id })}>{t('common.accept')}</button
    >
    <a class="button" href="/">{t('common.decline')}</a>
  {/if}
  {#if error}
    <p class="error" role="alert">{error}</p>
  {:else if !challenge}
    <p class="muted">{t('challengePage.loading')}</p>
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
