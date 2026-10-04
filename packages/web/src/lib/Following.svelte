<script lang="ts">
  import { api, session } from './session.svelte.ts';

  /** The players you follow: who's online, and a link to the game they're playing. */
  const REFRESH_MS = 15_000;

  interface Followed {
    username: string;
    online: boolean;
    gameId: string | null;
  }

  let players = $state<Followed[]>([]);

  // Loads once signed in (the session arrives after the page), then refreshes.
  $effect(() => {
    if (!session.user) return;
    const refresh = () =>
      api<Followed[]>('GET', '/api/following').then(
        (loaded) => (players = loaded),
        () => {}, // A missed refresh is fine; the next one catches up.
      );
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  });

  // Playing first, then online, then the rest.
  const sorted = $derived(
    players.toSorted(
      (a, b) => Number(!!b.gameId) - Number(!!a.gameId) || Number(b.online) - Number(a.online),
    ),
  );
</script>

{#if session.user && players.length > 0}
  <section class="card">
    <h2>Following</h2>
    <ul>
      {#each sorted as player (player.username)}
        <li>
          <span class="dot" class:online={player.online} aria-hidden="true"></span>
          <a href="/@{player.username}">{player.username}</a>
          {#if player.gameId}
            <a class="watch" href="/game/{player.gameId}">Watch</a>
          {:else}
            <span class="muted">{player.online ? 'online' : 'offline'}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  ul {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--border);
  }

  .dot.online {
    background: var(--hint);
  }

  .watch,
  .muted {
    margin-left: auto;
    font-size: 0.9rem;
  }
</style>
