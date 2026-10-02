<script lang="ts">
  import { page } from '$app/state';
  import { api, session, socket } from '#lib/session.svelte.ts';

  let status = $state<'checking' | 'done' | 'failed'>('checking');
  let error = $state('');

  $effect(() => {
    const token = page.url.searchParams.get('token') ?? '';
    api('POST', '/api/verify-email', { token })
      .then(() => {
        status = 'done';
        if (session.user) session.user.emailVerified = true;
        socket.reconnect(); // so the live connection knows too
      })
      .catch((e: Error) => {
        status = 'failed';
        error = e.message;
      });
  });
</script>

<section class="card">
  {#if status === 'checking'}
    <p class="muted">Confirming your email…</p>
  {:else if status === 'done'}
    <h1>Email confirmed</h1>
    <p>You can now play rated games.</p>
    <a class="button primary" href="/play">Play</a>
  {:else}
    <h1>That didn't work</h1>
    <p role="alert">{error}</p>
    <p class="muted">You can send a new link from your <a href="/account">settings</a>.</p>
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
    font-size: 1.5rem;
  }
</style>
