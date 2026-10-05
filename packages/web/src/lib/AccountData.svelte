<script lang="ts">
  import { goto } from '$app/navigation';
  import { t } from './i18n.svelte.ts';
  import { api, session, socket } from './session.svelte.ts';

  let { twoFactor }: { twoFactor: boolean } = $props();

  let password = $state('');
  let code = $state('');
  let confirmed = $state(false);
  let error = $state('');

  async function remove(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    try {
      await api('POST', '/api/account/delete', { password, code: twoFactor ? code : undefined });
      session.user = null;
      socket.reconnect();
      goto('/');
    } catch (e) {
      error = (e as Error).message;
    }
  }
</script>

<section class="card">
  <h2>{t('data.title')}</h2>
  <p>
    {t('data.download')}
    <a class="button" href="/api/account/export" download>{t('data.downloadButton')}</a>
  </p>
  <details>
    <summary>{t('data.delete')}</summary>
    <p>{t('data.deleteWarning')}</p>
    <form onsubmit={remove}>
      <label>
        {t('auth.password')}
        <input type="password" bind:value={password} autocomplete="current-password" required />
      </label>
      {#if twoFactor}
        <label>
          {t('auth.code')}
          <input bind:value={code} autocomplete="one-time-code" required />
        </label>
      {/if}
      <label class="confirm">
        <input type="checkbox" bind:checked={confirmed} required />
        {t('data.understand')}
      </label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="button danger" disabled={!confirmed}>{t('data.delete')}</button>
    </form>
  </details>
</section>

<style>
  section {
    margin-bottom: 1rem;
  }

  summary {
    cursor: pointer;
    color: var(--blunder);
  }

  form {
    display: grid;
    gap: 0.75rem;
    max-width: 22rem;
  }

  label {
    display: grid;
    gap: 0.25rem;
  }

  .confirm {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  input:not([type='checkbox']) {
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }

  .danger:enabled {
    border-color: var(--blunder);
    color: var(--blunder);
  }

  .error {
    color: var(--o);
  }
</style>
