<script lang="ts">
  import { page } from '$app/state';
  import { around, t } from '#lib/i18n.svelte.ts';
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
    <p class="muted">{t('verify.checking')}</p>
  {:else if status === 'done'}
    <h1>{t('verify.done')}</h1>
    <p>{t('verify.rated')}</p>
    <a class="button primary" href="/">{t('nav.play')}</a>
  {:else}
    {@const [before, after] = around('verify.again', 'link')}
    <h1>{t('verify.failed')}</h1>
    <p role="alert">{error}</p>
    <p class="muted">{before}<a href="/account">{t('lobby.settings')}</a>{after}</p>
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
