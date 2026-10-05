<script lang="ts">
  import { RATING_KINDS, type FeedbackKind, type RatingKind, type ReportReason } from '@uttt/core';
  import { api } from '#lib/session.svelte.ts';
  import { timing, type Tournament } from '#lib/tournament.ts';
  import TournamentForm from '#lib/TournamentForm.svelte';
  import { onMount } from 'svelte';

  interface Report {
    id: number;
    reporter: string | null;
    reported: string;
    reason: ReportReason;
    details: string;
    createdAt: string;
  }

  interface Feedback {
    id: number;
    username: string | null;
    kind: FeedbackKind;
    text: string;
    createdAt: string;
  }

  interface Player {
    username: string;
    email: string;
    createdAt: string;
    emailVerified: boolean;
    twoFactor: boolean;
    closedAt: string | null;
    closedReason: string | null;
    ratings: Record<RatingKind, { rating: number; provisional: boolean; games: number }>;
    games: unknown[];
  }

  interface LogEntry {
    id: number;
    admin: string;
    action: string;
    target: string;
    details: string;
    createdAt: string;
  }

  let allowed = $state(true);
  let reports = $state<Report[]>([]);
  let feedback = $state<Feedback[]>([]);
  let log = $state<LogEntry[]>([]);
  let lookup = $state('');
  let player = $state<Player | null>(null);
  let closeReason = $state('');
  let newName = $state('');
  let error = $state('');
  let tournaments = $state<Tournament[]>([]);

  const date = (iso: string) => new Date(iso).toLocaleString();

  async function refresh() {
    try {
      let list: { current: Tournament[] };
      [reports, feedback, log, list] = await Promise.all([
        api<Report[]>('GET', '/api/admin/reports'),
        api<Feedback[]>('GET', '/api/admin/feedback'),
        api<LogEntry[]>('GET', '/api/admin/log'),
        api<{ current: Tournament[] }>('GET', '/api/tournaments'),
      ]);
      tournaments = list.current;
    } catch {
      allowed = false;
    }
  }

  onMount(refresh);

  /** Runs an admin request, then reloads the player shown and the lists. */
  async function run(request: () => Promise<unknown>) {
    error = '';
    try {
      await request();
      if (player) await find(player.username);
      await refresh();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function find(name: string) {
    error = '';
    lookup = name;
    try {
      player = await api<Player>('GET', `/api/admin/users/${encodeURIComponent(name)}`);
      newName = player.username;
    } catch (e) {
      player = null;
      error = (e as Error).message;
    }
  }

  const act = (action: string, body?: object) =>
    api('POST', `/api/admin/users/${encodeURIComponent(player?.username ?? '')}/${action}`, body);

  async function rename() {
    await run(() => act('rename', { username: newName }));
    if (!error) await find(newName);
  }
</script>

<h1>Admin</h1>

{#if !allowed}
  <p class="card">
    Admins only. Admin accounts are set on the server, need a confirmed email, and need two-factor
    authentication turned on (in <a href="/account">Settings</a>).
  </p>
{:else}
  {#if error}<p class="card error" role="alert">{error}</p>{/if}

  <section class="card">
    <h2>Open reports</h2>
    {#if reports.length === 0}
      <p class="muted">Nothing to review.</p>
    {:else}
      <ul class="reports">
        {#each reports as report (report.id)}
          <li>
            <p>
              <strong><a href="/@{report.reported}">{report.reported}</a></strong> · {report.reason}
              <span class="muted">
                · by {report.reporter ?? 'a deleted account'} · {date(report.createdAt)}
              </span>
            </p>
            <p class="details">{report.details}</p>
            <div class="buttons">
              <button class="button" onclick={() => find(report.reported)}>Look up player</button>
              <button
                class="button"
                onclick={() => run(() => api('POST', `/api/admin/reports/${report.id}/resolve`))}
              >
                Mark resolved
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="card">
    <h2>Feedback</h2>
    {#if feedback.length === 0}
      <p class="muted">Nothing new.</p>
    {:else}
      <ul class="reports">
        {#each feedback as item (item.id)}
          <li>
            <p>
              <strong>{item.kind}</strong>
              <span class="muted">
                · from {item.username ?? 'a deleted account'} · {date(item.createdAt)}
              </span>
            </p>
            <p class="details">{item.text}</p>
            <button
              class="button"
              onclick={() => run(() => api('POST', `/api/admin/feedback/${item.id}/done`))}
            >
              Mark done
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="card">
    <h2>Player</h2>
    <form
      class="buttons"
      onsubmit={(event) => {
        event.preventDefault();
        find(lookup);
      }}
    >
      <input bind:value={lookup} placeholder="Username" aria-label="Username" required />
      <button class="button primary">Look up</button>
    </form>

    {#if player}
      <dl>
        <dt>Username</dt>
        <dd><a href="/@{player.username}">{player.username}</a></dd>
        <dt>Email</dt>
        <dd>{player.email} {player.emailVerified ? '(confirmed)' : '(not confirmed)'}</dd>
        <dt>Joined</dt>
        <dd>{date(player.createdAt)}</dd>
        <dt>Two-factor</dt>
        <dd>{player.twoFactor ? 'On' : 'Off'}</dd>
        <dt>Ratings</dt>
        <dd>
          {#each RATING_KINDS as category (category)}
            {@const rating = player.ratings[category]}
            <span>
              {category}
              {rating.rating}{rating.provisional ? '?' : ''} ({rating.games})
            </span>
          {/each}
        </dd>
        <dt>Status</dt>
        <dd>
          {player.closedAt ? `Closed ${date(player.closedAt)}: ${player.closedReason}` : 'Active'}
        </dd>
      </dl>

      <div class="tools">
        {#if player.closedAt}
          <button class="button" onclick={() => run(() => act('reopen'))}>Reopen account</button>
        {:else}
          <form
            class="buttons"
            onsubmit={(event) => {
              event.preventDefault();
              run(() => act('close', { reason: closeReason }));
              closeReason = '';
            }}
          >
            <input bind:value={closeReason} placeholder="Reason" aria-label="Reason" required />
            <button class="button danger">Close account</button>
          </form>
        {/if}
        <form
          class="buttons"
          onsubmit={(event) => {
            event.preventDefault();
            rename();
          }}
        >
          <input bind:value={newName} aria-label="New username" required />
          <button class="button">Rename</button>
        </form>
        <button
          class="button"
          onclick={() => {
            if (confirm(`Reset all of ${player?.username}'s ratings to 1500?`)) {
              run(() => act('reset-ratings'));
            }
          }}
        >
          Reset ratings
        </button>
      </div>
    {/if}
  </section>

  <section class="card">
    <h2>Tournaments</h2>
    <TournamentForm official />
    {#each tournaments as tournament (tournament.id)}
      <p class="tournament">
        <a href="/tournaments/{tournament.id}">{tournament.name}</a>
        <span class="muted">
          {tournament.timeControl} · {timing(tournament, Date.now())} · {tournament.players} players
        </span>
        <button
          class="button"
          onclick={() => run(() => api('POST', `/api/tournaments/${tournament.id}/cancel`))}
        >
          Cancel
        </button>
      </p>
    {/each}
  </section>

  <section class="card">
    <h2>Log</h2>
    {#if log.length === 0}
      <p class="muted">No admin actions yet.</p>
    {:else}
      <table>
        <tbody>
          {#each log as entry (entry.id)}
            <tr>
              <td class="muted">{date(entry.createdAt)}</td>
              <td>{entry.admin}</td>
              <td>{entry.action}</td>
              <td>{entry.target}</td>
              <td class="muted">{entry.details}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
{/if}

<style>
  h1 {
    margin-top: 0;
  }

  section {
    margin-bottom: 1rem;
  }

  .reports {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .reports li {
    padding: 0.75rem 0;
    border-top: 1px solid var(--border);
  }

  .reports p {
    margin: 0 0 0.4rem;
  }

  .details {
    white-space: pre-wrap;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  input {
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.3rem 1rem;
    margin: 1rem 0;
  }

  dt {
    color: var(--muted);
  }

  dd {
    display: flex;
    flex-wrap: wrap;
    gap: 0 1rem;
    margin: 0;
  }

  .tools {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
  }

  .tournament {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
    margin: 0;
    padding: 0.5rem 0;
    border-top: 1px solid var(--border);
  }

  .danger {
    border-color: var(--blunder);
    color: var(--blunder);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  td {
    padding: 0.35rem 0.5rem 0.35rem 0;
    border-top: 1px solid var(--border);
    vertical-align: top;
  }

  .error {
    border-color: var(--blunder);
    color: var(--blunder);
  }
</style>
