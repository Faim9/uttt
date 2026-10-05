<script lang="ts">
  import { renderSVG } from 'uqr';
  import { t } from './i18n.svelte.ts';
  import { api } from './session.svelte.ts';

  interface Props {
    enabled: boolean;
    /** Called after two-factor was turned on or off, so the page can refresh. */
    onchange: () => void;
  }

  let { enabled, onchange }: Props = $props();

  let setup = $state<{ secret: string; uri: string } | null>(null);
  let recoveryCodes = $state<string[] | null>(null);
  let code = $state('');
  let password = $state('');
  let error = $state('');

  const qr = $derived(
    setup && `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(setup.uri, { border: 2 }))}`,
  );

  async function run(action: () => Promise<void>) {
    error = '';
    try {
      await action();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const start = () =>
    run(async () => {
      setup = await api('POST', '/api/account/2fa/setup');
    });

  const enable = (event: SubmitEvent) =>
    run(async () => {
      event.preventDefault();
      const result = await api<{ recoveryCodes: string[] }>('POST', '/api/account/2fa/enable', {
        secret: setup?.secret,
        code: code.trim(),
      });
      recoveryCodes = result.recoveryCodes;
      setup = null;
      code = '';
      onchange();
    });

  const disable = (event: SubmitEvent) =>
    run(async () => {
      event.preventDefault();
      await api('POST', '/api/account/2fa/disable', { password });
      password = '';
      onchange();
    });
</script>

<section class="card">
  <h2>{t('twoFactor.title')}</h2>
  {#if recoveryCodes}
    <p><strong>{t('twoFactor.isOn')}</strong></p>
    <p>{t('twoFactor.saveCodes')}</p>
    <ul class="codes">
      {#each recoveryCodes as recoveryCode (recoveryCode)}<li>{recoveryCode}</li>{/each}
    </ul>
    <button class="button primary" onclick={() => (recoveryCodes = null)}
      >{t('twoFactor.saved')}</button
    >
  {:else if enabled}
    <p>{t('twoFactor.on')}</p>
    <form onsubmit={disable}>
      <label>
        {t('auth.password')}
        <input type="password" bind:value={password} autocomplete="current-password" required />
      </label>
      <button class="button">{t('twoFactor.turnOff')}</button>
    </form>
  {:else if setup}
    <p>{t('twoFactor.scan')}</p>
    <img src={qr} alt={t('twoFactor.qr')} width="180" height="180" />
    <p class="muted">{t('twoFactor.key')} <code>{setup.secret.match(/.{4}/g)?.join(' ')}</code></p>
    <form onsubmit={enable}>
      <label>
        {t('twoFactor.code')}
        <input
          bind:value={code}
          autocomplete="one-time-code"
          inputmode="numeric"
          pattern={'\\d{6}'}
          required
        />
      </label>
      <button class="button primary">{t('twoFactor.turnOn')}</button>
    </form>
  {:else}
    <p>{t('twoFactor.pitch')}</p>
    <button class="button" onclick={start}>{t('twoFactor.setUp')}</button>
  {/if}

  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  section {
    margin-bottom: 1rem;
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

  input {
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }

  img {
    display: block;
    border-radius: 8px;
    background: white;
  }

  .codes {
    display: grid;
    grid-template-columns: repeat(2, max-content);
    gap: 0.25rem 2rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    background: var(--bg);
    font-family: ui-monospace, monospace;
    list-style: none;
  }

  .error {
    color: var(--o);
  }
</style>
