<script lang="ts">
  import { CATEGORIES, type Category } from '@uttt/core';
  import ChallengeDialog from '#lib/ChallengeDialog.svelte';
  import { around, t } from '#lib/i18n.svelte.ts';
  import { api, session } from '#lib/session.svelte.ts';
  import { onMount } from 'svelte';

  /** People and bots are ranked apart; bots online now can be challenged from here. */
  const BOT_GUIDE = 'https://github.com/Faim9/uttt/blob/main/docs/bot-api.md';

  interface Entry {
    username: string;
    rating: number;
    games: number;
  }

  let category = $state<Category>('blitz');
  let bots = $state(false);
  let entries = $state<Entry[] | null>(null);
  let online = $state<{ username: string; playing: boolean; bullet: number; blitz: number }[]>([]);
  let challenged = $state('');
  let dialog: ChallengeDialog | undefined = $state();

  $effect(() => {
    entries = null;
    const path = `/api/leaderboard/${category}${bots ? '?bots' : ''}`;
    api<Entry[]>('GET', path).then((loaded) => (entries = loaded));
  });

  onMount(() => {
    api<typeof online>('GET', '/api/bots').then((loaded) => (online = loaded));
  });

  function challenge(username: string) {
    challenged = username;
    // The dialog takes the new name before it opens.
    queueMicrotask(() => dialog?.open());
  }
</script>

<h1>{t('nav.leaderboard')}</h1>

<div class="tabs" role="group" aria-label={t('leaderboard.who')}>
  <button class="button" class:primary={!bots} onclick={() => (bots = false)}
    >{t('leaderboard.people')}</button
  >
  <button class="button" class:primary={bots} onclick={() => (bots = true)}
    >{t('leaderboard.bots')}</button
  >
</div>

{#if bots}
  {@const [before, after] = around('leaderboard.botsAbout', 'link')}
  <section class="card">
    <h2>{t('leaderboard.botsOnline')}</h2>
    {#if online.length === 0}
      <p class="muted">{t('leaderboard.noBots')}</p>
    {:else}
      <ul class="bots">
        {#each online as bot (bot.username)}
          <li>
            <a href="/@{bot.username}">{bot.username}</a>
            <span class="bot-tag">BOT</span>
            <span class="muted"
              >{t('category.blitz')} {bot.blitz} · {t('category.bullet')} {bot.bullet}</span
            >
            {#if bot.playing}
              <span class="muted">{t('leaderboard.playing')}</span>
            {:else if session.user}
              <button class="button" onclick={() => challenge(bot.username)}
                >{t('profile.challenge')}</button
              >
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <p class="muted">{before}<a href={BOT_GUIDE}>{t('bots.api')}</a>{after}</p>
  </section>
  <ChallengeDialog bind:this={dialog} username={challenged} bot />
{/if}

<div class="tabs" role="tablist" aria-label={t('leaderboard.category')}>
  {#each CATEGORIES as tab (tab)}
    <button
      class="button"
      class:primary={tab === category}
      role="tab"
      aria-selected={tab === category}
      onclick={() => (category = tab)}>{t(`category.${tab}`)}</button
    >
  {/each}
</div>

<section class="card">
  {#if entries === null}
    <p class="muted">{t('common.loading')}</p>
  {:else if entries.length === 0}
    <p class="muted">{t('leaderboard.empty')}</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>#</th><th>{t('leaderboard.player')}</th><th>{t('graph.ratingColumn')}</th><th
            >{t('history.title')}</th
          >
        </tr>
      </thead>
      <tbody>
        {#each entries as entry, i (entry.username)}
          <tr>
            <td>{i + 1}</td>
            <td><a href="/@{entry.username}">{entry.username}</a></td>
            <td>{entry.rating}</td>
            <td class="muted">{entry.games}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  h1 {
    margin-top: 0;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    text-transform: capitalize;
  }

  .bots {
    display: grid;
    gap: 0.4rem;
    margin: 0 0 0.75rem;
    padding: 0;
    list-style: none;
  }

  .bots li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .bots .button {
    margin-left: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 0.5rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  th {
    color: var(--muted);
    font-weight: 600;
  }
</style>
