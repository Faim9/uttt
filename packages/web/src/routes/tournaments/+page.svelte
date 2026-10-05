<script lang="ts">
  import { t, tn } from '#lib/i18n.svelte.ts';
  import { api, session } from '#lib/session.svelte.ts';
  import { timing, type Tournament } from '#lib/tournament.ts';
  import TournamentForm from '#lib/TournamentForm.svelte';
  import { onMount } from 'svelte';

  let list = $state<{ current: Tournament[]; finished: Tournament[] } | null>(null);
  let now = $state(Date.now());

  onMount(() => {
    api<NonNullable<typeof list>>('GET', '/api/tournaments').then((loaded) => (list = loaded));
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
</script>

<h1>{t('nav.tournaments')}</h1>
<p class="muted">{t('tournaments.intro')}</p>

{#if session.user && !session.user.bot}
  <details class="card create">
    <summary>{t('tournaments.create')}</summary>
    {#if session.user.emailVerified}
      <TournamentForm />
    {:else}
      <p class="muted">{t('error.confirmToCreateTournaments')}</p>
    {/if}
  </details>
{/if}

{#snippet card(tournament: Tournament)}
  <a class="card tournament" href="/tournaments/{tournament.id}">
    <strong>{tournament.name}</strong>
    <span class="muted">
      {tournament.official
        ? t('tournaments.official')
        : t('tournaments.by', { name: tournament.creator ?? '—' })}
    </span>
    <span>{tournament.timeControl} · {t(tournament.rated ? 'game.rated' : 'game.casual')}</span>
    <span class="muted">
      {timing(tournament, now)} · {tn('tournaments.players', tournament.players)}
    </span>
  </a>
{/snippet}

{#if list}
  <h2>{t('tournaments.current')}</h2>
  {#if list.current.length === 0}
    <p class="muted">{t('tournaments.none')}</p>
  {/if}
  <div class="list">
    {#each list.current as tournament (tournament.id)}{@render card(tournament)}{/each}
  </div>

  {#if list.finished.length > 0}
    <h2>{t('tournaments.finished')}</h2>
    <div class="list">
      {#each list.finished as tournament (tournament.id)}{@render card(tournament)}{/each}
    </div>
  {/if}
{:else}
  <p class="muted">{t('common.loading')}</p>
{/if}

<style>
  h1 {
    margin-top: 0;
  }

  h2 {
    margin-top: 1.5rem;
    font-size: 1.1rem;
  }

  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 0.75rem;
  }

  .create {
    margin-top: 1rem;
  }

  .create summary {
    cursor: pointer;
    font-weight: 500;
  }

  .create[open] summary {
    margin-bottom: 1rem;
  }

  .tournament {
    display: grid;
    gap: 0.2rem;
    color: inherit;
    text-decoration: none;
  }

  .tournament:hover {
    border-color: var(--accent);
  }

  .tournament strong {
    font-size: 1.1rem;
  }
</style>
