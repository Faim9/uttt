<script lang="ts">
  import { page } from '$app/state';
  import { RATING_KINDS, type RatingKind } from '@uttt/core';
  import ChallengeDialog from '#lib/ChallengeDialog.svelte';
  import GameHistory from '#lib/GameHistory.svelte';
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
    if (
      action === 'block' &&
      !confirm(`Block ${username}? You won't be paired or play each other.`)
    ) {
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
        {#if profile.online}<span class="online">Online</span> ·{/if}
        Joined {new Date(profile.createdAt).toLocaleDateString()} ·
        {profile.followers}
        {profile.followers === 1 ? 'follower' : 'followers'}
      </p>
    </div>
    {#if session.user && !isMe}
      <div class="actions">
        {#if profile.blocked}
          <button class="button" onclick={() => relate('unblock')}>Unblock</button>
        {:else}
          {#if profile.online && !profile.closed}
            <button class="button primary" onclick={() => challenge?.open()}>Challenge</button>
          {/if}
          <button
            class="button"
            class:primary={!profile.following && !profile.online}
            onclick={() => relate(profile?.following ? 'unfollow' : 'follow')}
          >
            {profile.following ? 'Following' : 'Follow'}
          </button>
          <button class="button" onclick={() => relate('block')}>Block</button>
        {/if}
        <button class="button" onclick={() => report?.open()}>Report</button>
      </div>
    {/if}
  </header>
  {#if profile.closed}
    <p class="card closed">This account was closed for breaking the terms of use.</p>
  {/if}
  <ReportDialog bind:this={report} username={profile.username} />
  <ChallengeDialog bind:this={challenge} username={profile.username} bot={profile.bot} />

  <div class="ratings">
    {#each RATING_KINDS as kind (kind)}
      {@const rating = profile.ratings[kind]}
      {@const counted = kind === 'puzzle' ? 'puzzle' : 'game'}
      <button class="card rating" aria-pressed={graphed === kind} onclick={() => (graphed = kind)}>
        <h2>{kind === 'puzzle' ? 'puzzles' : kind}</h2>
        <strong>{rating.rating}{rating.provisional ? '?' : ''}</strong>
        <span class="muted">{rating.games} {counted}{rating.games === 1 ? '' : 's'}</span>
      </button>
    {/each}
  </div>

  <section class="card graph">
    <h2>{graphed} rating over time</h2>
    <RatingGraph points={profile.history[graphed]} />
  </section>

  <GameHistory username={profile.username} />
{:else}
  <p class="muted">{error || 'Loading…'}</p>
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
