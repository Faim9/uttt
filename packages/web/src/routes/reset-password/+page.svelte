<script lang="ts">
  import { page } from '$app/state';
  import { t } from '#lib/i18n.svelte.ts';
  import { api, session, socket } from '#lib/session.svelte.ts';

  /** Without a token this page asks for the email; with one (from the emailed link) it sets the password. */
  const token = $derived(page.url.searchParams.get('token'));

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let done = $state(false);
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      if (token) {
        await api('POST', '/api/password-reset', { token, password });
        // Resetting signed out every device, including this one.
        session.user = null;
        socket.reconnect();
      } else {
        await api('POST', '/api/password-reset/request', { email });
      }
      done = true;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<form class="card" onsubmit={submit}>
  <h1>{t(token ? 'reset.choose' : 'reset.title')}</h1>

  {#if done && token}
    <p>{t('reset.changed')}</p>
    <a class="button primary" href="/login">{t('nav.signIn')}</a>
  {:else if done}
    <p>{t('reset.sent', { email })}</p>
  {:else}
    {#if token}
      <label>
        {t('account.newPassword')}
        <input
          type="password"
          bind:value={password}
          autocomplete="new-password"
          minlength="8"
          required
        />
      </label>
    {:else}
      <label>
        {t('auth.email')}
        <input type="email" bind:value={email} autocomplete="email" required />
      </label>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="button primary" disabled={busy}>
      {t(token ? 'reset.set' : 'reset.send')}
    </button>
  {/if}
</form>

<style>
  form {
    display: grid;
    gap: 1rem;
    max-width: 24rem;
    margin: 2rem auto;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }

  input {
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    font-weight: 400;
  }

  p {
    margin: 0;
  }

  .error {
    color: var(--o);
  }
</style>
