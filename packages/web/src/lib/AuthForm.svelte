<script lang="ts">
  import { goto } from '$app/navigation';
  import Captcha from './Captcha.svelte';
  import { around, t } from './i18n.svelte.ts';
  import { ApiError, authenticate } from './session.svelte.ts';

  let { mode }: { mode: 'login' | 'signup' } = $props();

  let fields = $state({ username: '', email: '', login: '', password: '', code: '' });
  /** Set once the server says this account needs a two-factor code. */
  let needsCode = $state(false);
  let error = $state('');
  let busy = $state(false);
  let captcha = $state('');
  let captchaCheck: Captcha | undefined = $state();

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      const { username, email, login, password, code } = fields;
      const body =
        mode === 'signup'
          ? { username, email, password, captcha: captcha || undefined }
          : { login, password, code: needsCode ? code : undefined };
      await authenticate(mode, body);
      goto('/');
    } catch (e) {
      if (e instanceof ApiError && e.data.twoFactor && !needsCode) {
        needsCode = true;
        return;
      }
      error = (e as Error).message;
      captcha = '';
      captchaCheck?.reset();
    } finally {
      busy = false;
    }
  }
</script>

<form class="card" onsubmit={submit}>
  <h1>{t(mode === 'login' ? 'nav.signIn' : 'nav.createAccount')}</h1>
  {#if mode === 'login'}
    <label>
      {t('auth.login')}
      <input bind:value={fields.login} autocomplete="username" required />
    </label>
  {:else}
    <label>
      {t('auth.username')}
      <input
        bind:value={fields.username}
        autocomplete="username"
        pattern={'[A-Za-z0-9_\\-]{3,20}'}
        title={t('auth.usernameRule')}
        required
      />
    </label>
    <label>
      {t('auth.email')}
      <input type="email" bind:value={fields.email} autocomplete="email" required />
    </label>
  {/if}
  <label>
    {t('auth.password')}
    <input
      type="password"
      bind:value={fields.password}
      autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
      minlength={mode === 'signup' ? 8 : undefined}
      required
    />
  </label>

  {#if mode === 'signup'}
    <Captcha ontoken={(token) => (captcha = token)} bind:this={captchaCheck} />
  {/if}

  {#if needsCode}
    <label>
      {t('auth.code')}
      <input
        bind:value={fields.code}
        autocomplete="one-time-code"
        placeholder={t('auth.codePlaceholder')}
        required
      />
    </label>
  {/if}

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <button class="button primary" disabled={busy}>
    {t(mode === 'login' ? 'nav.signIn' : 'nav.signUp')}
  </button>
  <p class="muted">
    {#if mode === 'login'}
      {t('auth.newHere')} <a href="/signup">{t('nav.createAccount')}</a> ·
      <a href="/reset-password">{t('auth.forgot')}</a>
    {:else}
      {t('auth.haveAccount')} <a href="/login">{t('nav.signIn')}</a>
    {/if}
  </p>
  {#if mode === 'signup'}
    {@const [start, rest] = around('auth.agree', 'terms')}
    {@const [middle, end] = rest.split('{privacy}')}
    <p class="muted">
      {start}<a href="/terms">{t('auth.terms')}</a>{middle}<a href="/privacy">{t('auth.privacy')}</a
      >{end}
    </p>
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

  .error {
    margin: 0;
    color: var(--o);
  }

  p {
    margin: 0;
  }
</style>
