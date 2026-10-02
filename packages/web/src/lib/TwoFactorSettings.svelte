<script lang="ts">
  import { renderSVG } from 'uqr';
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
  <h2>Two-factor authentication</h2>

  {#if recoveryCodes}
    <p><strong>Two-factor authentication is on.</strong></p>
    <p>
      Save these recovery codes somewhere safe. Each works once, if you lose your device. They won't
      be shown again.
    </p>
    <ul class="codes">
      {#each recoveryCodes as recoveryCode (recoveryCode)}<li>{recoveryCode}</li>{/each}
    </ul>
    <button class="button primary" onclick={() => (recoveryCodes = null)}>I've saved them</button>
  {:else if enabled}
    <p>On. Signing in asks for a code from your authenticator app.</p>
    <form onsubmit={disable}>
      <label>
        Password
        <input type="password" bind:value={password} autocomplete="current-password" required />
      </label>
      <button class="button">Turn off</button>
    </form>
  {:else if setup}
    <p>Scan this with an authenticator app (e.g. Aegis, Google Authenticator, 1Password):</p>
    <img src={qr} alt="QR code for your authenticator app" width="180" height="180" />
    <p class="muted">Or enter this key: <code>{setup.secret.match(/.{4}/g)?.join(' ')}</code></p>
    <form onsubmit={enable}>
      <label>
        Code from the app
        <input
          bind:value={code}
          autocomplete="one-time-code"
          inputmode="numeric"
          pattern={'\\d{6}'}
          required
        />
      </label>
      <button class="button primary">Turn on</button>
    </form>
  {:else}
    <p>Protect your account with a code from your phone in addition to your password.</p>
    <button class="button" onclick={start}>Set up</button>
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
