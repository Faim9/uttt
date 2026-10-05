<script lang="ts">
  import { page } from '$app/state';
  import { RATING_KINDS, type RatingKind } from '@uttt/core';
  import ChallengeDialog from '#lib/ChallengeDialog.svelte';
  import GameHistory from '#lib/GameHistory.svelte';
  import { t, tn } from '#lib/i18n.svelte.ts';
  import RatingGraph from '#lib/RatingGraph.svelte';
  import ReportDialog from '#lib/ReportDialog.svelte';
  import { api, session } from '#lib/session.svelte.ts';

  interface Profile {
    username: string;
    createdAt: string;
    bot: boolean;
    online: boolean;
    closed: boolean;
    followers: number;
    /** How the signed-in viewer relates to this player. */
    following: boolean;
    blocked: boolean;
    ratings: Record<RatingKind, { rating: number; provisional: boolean; games: number }>;
    history: Record<RatingKind, { rating: number; at: string }[]>;
  }

  const username = $derived(page.params.username ?? '');
  let profile = $state<Profile | null>(null);
  let error = $state('');
  let report: ReportDialog | undefined = $state();
  let challenge: ChallengeDialog | undefined = $state();
  const kindName = (kind: RatingKind) =>
    kind === 'puzzle' ? t('nav.puzzles') : t(`category.${kind}`);

  /** The rating whose graph is shown; picked by clicking it. */
  let graphed = $state<RatingKind>('blitz');
  const isMe = $derived(session.user?.username.toLowerCase() === username.toLowerCase());
  const path = $derived(`/api/users/${encodeURIComponent(username)}`);

  async function load() {
    try {
      const loaded = await api<Profile>('GET', path);
      // Start on the rating with the most rated games or puzzles.
      if (profile?.username !== loaded.username) {
        graphed = RATING_KINDS.reduce((a, b) =>
          loaded.history[b].length > loaded.history[a].length ? b : a,
        );
      }
      profile = loaded;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  $effect(() => {
    profile = null;
    load();
  });

  async function relate(action: 'follow' | 'unfollow' | 'block' | 'unblock') {
    if (action === 'block' && !confirm(t('profile.blockConfirm', { name: username }))) {
      return;
    }
    await api('POST', `${path}/${action}`);
    await load();
  }
</script>

{#if profile}
  <header>
    <div>
      <h1>
        {profile.username}
        {#if profile.bot}<span class="bot-tag">BOT</span>{/if}
      </h1>
      <p class="muted">
        {#if profile.online}<span class="online">{t('profile.online')}</span> ·{/if}
        {t('profile.joined', { date: new Date(profile.createdAt).toLocaleDateString() })} ·
        {tn('profile.followers', profile.followers)}
      </p>
    </div>
    {#if session.user && !isMe}
      <div class="actions">
        {#if profile.blocked}
          <button class="button" onclick={() => relate('unblock')}>{t('profile.unblock')}</button>
        {:else}
          {#if profile.online && !profile.closed}
            <button class="button primary" onclick={() => challenge?.open()}
              >{t('profile.challenge')}</button
            >
          {/if}
          <button
            class="button"
            class:primary={!profile.following && !profile.online}
            onclick={() => relate(profile?.following ? 'unfollow' : 'follow')}
          >
            {t(profile.following ? 'following.title' : 'profile.follow')}
          </button>
          <button class="button" onclick={() => relate('block')}>{t('profile.block')}</button>
        {/if}
        <button class="button" onclick={() => report?.open()}>{t('profile.report')}</button>
      </div>
    {/if}
  </header>
  {#if profile.closed}
    <p class="card closed">{t('error.accountClosed')}</p>
  {/if}
  <ReportDialog bind:this={report} username={profile.username} />
  <ChallengeDialog bind:this={challenge} username={profile.username} bot={profile.bot} />

  <div class="ratings">
    {#each RATING_KINDS as kind (kind)}
      {@const rating = profile.ratings[kind]}
      <button class="card rating" aria-pressed={graphed === kind} onclick={() => (graphed = kind)}>
        <h2>{kindName(kind)}</h2>
        <strong>{rating.rating}{rating.provisional ? '?' : ''}</strong>
        <span class="muted"
          >{tn(kind === 'puzzle' ? 'profile.puzzles' : 'profile.games', rating.games)}</span
        >
      </button>
    {/each}
  </div>

  <section class="card graph">
    <h2>{t('profile.graph', { kind: kindName(graphed) })}</h2>
    <RatingGraph points={profile.history[graphed]} />
  </section>

  <GameHistory username={profile.username} />
{:else}
  <p class="muted">{error || t('common.loading')}</p>
{/if}

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: start;
    justify-content: space-between;
  }

  h1 {
    margin: 0;
  }

  header p {
    margin: 0.25rem 0 0;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .online {
    color: var(--hint);
    font-weight: 600;
  }

  .closed {
    margin: 1rem 0 0;
    border-color: var(--blunder);
  }

  .ratings {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.75rem;
    margin: 1.5rem 0;
  }

  .rating {
    text-align: left;
    cursor: pointer;
  }

  .rating[aria-pressed='true'] {
    border-color: var(--accent);
  }

  .ratings strong {
    display: block;
    font-size: 1.75rem;
  }

  .graph {
    margin-bottom: 1rem;
  }
</style>
