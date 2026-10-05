<script lang="ts">
  import { page } from '$app/state';
  import { around, t } from '#lib/i18n.svelte.ts';
  import { api, session, socket } from '#lib/session.svelte.ts';
  import { phaseOf, timing, type Tournament } from '#lib/tournament.ts';
  import { onMount } from 'svelte';

  interface Details extends Omit<Tournament, 'players'> {
    joined: boolean;
    standings: { username: string; score: number; games: number; playing: string | null }[];
  }

  /** Standings refresh this often; pairing itself happens on the server. */
  const REFRESH_MS = 3000;

  const id = $derived(page.params.id ?? '');
  let tournament = $state<Details | null>(null);
  let now = $state(Date.now());
  let joining = $state(false);
  let paused = $state(false);
  let error = $state('');

  const phase = $derived(tournament ? phaseOf(tournament, now) : 'upcoming');
  const joined = $derived(joining || !!tournament?.joined);
  /** Staying on this page keeps you in the pairing; leaving it or pausing takes you out. */
  const ready = $derived(joined && !paused && phase !== 'finished' && socket.connected);

  onMount(() => {
    const load = () =>
      api<Details>('GET', `/api/tournaments/${id}`).then(
        (loaded) => (tournament = loaded),
        (e: Error) => (error = e.message),
      );
    load();
    const timers = [setInterval(load, REFRESH_MS), setInterval(() => (now = Date.now()), 1000)];
    return () => timers.forEach(clearInterval);
  });

  $effect(() => {
    if (!ready) return;
    socket.send({ type: 'arena', tournamentId: id, ready: true });
    return () => socket.send({ type: 'arena', tournamentId: id, ready: false });
  });

  $effect(() =>
    socket.listen((message) => {
      if (message.type === 'error') {
        error = message.message;
        joining = false;
        paused = true;
      }
    }),
  );

  function join() {
    error = '';
    joining = true;
    paused = false;
  }
</script>

{#if tournament}
  <div class="layout">
    <section class="card info">
      <h1>{tournament.name}</h1>
      <p>
        <strong>{tournament.timeControl}</strong> · {t(
          tournament.rated ? 'game.rated' : 'game.casual',
        )}
        · {t('tournament.arena')}
      </p>
      <p class="timing">{timing({ ...tournament, players: 0 }, now)}</p>

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      {#if phase === 'finished'}
        <p class="muted">{t('tournament.over')}</p>
      {:else if !session.user}
        {@const [before, after] = around('tournament.signIn', 'link')}
        <p>{before}<a href="/login">{t('nav.signIn')}</a>{after}</p>
      {:else if !joined || paused}
        <button class="button primary" onclick={join}
          >{t(joined ? 'tournament.resume' : 'tournament.join')}</button
        >
      {:else}
        <p class="waiting" role="status">
          {t(phase === 'upcoming' ? 'tournament.youreIn' : 'tournament.waiting')}
        </p>
        <button class="button" onclick={() => (paused = true)}>{t('tournament.pause')}</button>
      {/if}
      <p class="muted rules">{t('tournament.rules')}</p>
    </section>

    <section class="card">
      <h2>{t('tournament.standings')}</h2>
      {#if tournament.standings.length === 0}
        <p class="muted">{t('tournament.noPlayers')}</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>#</th><th>{t('leaderboard.player')}</th><th>{t('tournament.points')}</th><th
                >{t('history.title')}</th
              ><th></th>
            </tr>
          </thead>
          <tbody>
            {#each tournament.standings as row, i (row.username)}
              <tr class:me={row.username === session.user?.username}>
                <td>{i + 1}</td>
                <td><a href="/@{row.username}">{row.username}</a></td>
                <td><strong>{row.score}</strong></td>
                <td>{row.games}</td>
                <td>
                  {#if row.playing}<a href="/game/{row.playing}">{t('nav.watch')}</a>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  </div>
{:else}
  <p class="muted">{error || t('common.loading')}</p>
{/if}

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 22rem) minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }

  @media (max-width: 760px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.6rem;
  }

  .info p {
    margin: 0 0 0.75rem;
  }

  .timing {
    font-weight: 600;
  }

  .waiting {
    font-weight: 600;
    animation: pulse 1.6s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }

  .rules {
    margin-top: 1rem !important;
    font-size: 0.9rem;
  }

  .error {
    color: var(--blunder);
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.4rem 0.5rem 0.4rem 0;
    border-top: 1px solid var(--border);
    text-align: left;
  }

  th {
    border-top: 0;
    color: var(--muted);
    font-weight: 500;
  }

  tr.me td {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
</style>
