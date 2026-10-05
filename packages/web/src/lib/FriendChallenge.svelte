<script lang="ts">
  import { isCorrespondence, isTimeControl, type Player } from '@uttt/core';
  import { t } from './i18n.svelte.ts';
  import { api, socket } from './session.svelte.ts';
  import TimeControlPicker from './TimeControlPicker.svelte';

  /**
   * A dialog that creates a challenge link; the game starts when the friend opens it. A correspondence
   * link is stored instead: it waits until the friend accepts, whether or not you're still here.
   */
  let { rated }: { rated: boolean } = $props();

  let dialog: HTMLDialogElement;
  let timeControl = $state('5+3');
  /** Whether the link is a stored correspondence challenge, which outlives this page. */
  let stored = $state(false);
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
    if (!socket.connected && !stored) link = null;
  });
  $effect(() => () => socket.send({ type: 'cancelChallenge' }));

  async function create() {
    error = '';
    if (!isTimeControl(timeControl)) return;
    creating = true;
    if (!isCorrespondence(timeControl)) {
      return socket.send({ type: 'createChallenge', timeControl, color, rated });
    }
    try {
      const body = { timeControl, color, rated, listed: false };
      const { id } = await api<{ id: string }>('POST', '/api/correspondence', body);
      link = `${location.origin}/challenge/${id}`;
      stored = true;
    } catch (e) {
      error = (e as Error).message;
    }
    creating = false;
  }

  /** Closing the dialog withdraws a live challenge, so a stale link can't start a game later. */
  function closed() {
    if (link && !stored) socket.send({ type: 'cancelChallenge' });
    link = null;
    stored = false;
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<dialog bind:this={dialog} onclose={closed} aria-labelledby="friend-title">
  <h2 id="friend-title">{t('friend.title')}</h2>
  {#if link}
    <p>{t(stored ? 'friend.sendStored' : 'friend.send')}</p>
    <div class="row">
      <input readonly value={link} aria-label={t('friend.link')} />
      <button class="button primary" onclick={copy}
        >{t(copied ? 'common.copied' : 'common.copy')}</button
      >
    </div>
    {#if !stored}<p class="muted waiting">{t('friend.waiting')}</p>{/if}
  {:else}
    <TimeControlPicker correspondence onchange={(value) => (timeControl = value)} />
    <label>
      {t('challenge.youPlay')}
      <select bind:value={color}>
        <option value="random">{t('challenge.random')}</option>
        <option value="x">{t('challenge.x')}</option>
        <option value="o">O</option>
      </select>
    </label>
    <p class="muted">{t(rated ? 'friend.rated' : 'friend.casual')}</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  {/if}
  <div class="actions">
    <button class="button" onclick={() => dialog.close()}
      >{t(link && !stored ? 'challenge.cancel' : 'common.close')}</button
    >
    {#if !link}
      <button
        class="button primary"
        disabled={!socket.connected || creating || !isTimeControl(timeControl)}
        onclick={create}
      >
        {t('friend.create')}
      </button>
    {/if}
  </div>
</dialog>

<style>
  .waiting {
    animation: pulse 1.6s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.45;
    }
  }
</style>
