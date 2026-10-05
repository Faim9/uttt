<script lang="ts">
  import { around, t } from './i18n.svelte.ts';
  import { api } from './session.svelte.ts';

  /**
   * Bot accounts: turning a fresh account into one, and its API token. The token is shown once, when it's
   * made; the server keeps only its fingerprint.
   */
  interface Props {
    bot: boolean;
    /** Whether the bot has a token now. */
    hasToken: boolean;
    /** Called after a change, so the page reloads the account. */
    onchange: () => void;
  }

  let { bot, hasToken, onchange }: Props = $props();

  const GUIDE = 'https://github.com/Faim9/uttt/blob/main/docs/bot-api.md';
  let password = $state('');
  let token = $state('');
  let error = $state('');
  let copied = $state(false);

  async function run(request: () => Promise<unknown>) {
    error = '';
    try {
      await request();
      onchange();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function becomeBot(event: SubmitEvent) {
    event.preventDefault();
    const sure = confirm(t('bots.confirm'));
    if (sure) run(() => api('POST', '/api/account/bot', { password }));
  }

  const newToken = () =>
    run(async () => {
      token = (await api<{ token: string }>('POST', '/api/account/token')).token;
    });

  async function copy() {
    await navigator.clipboard.writeText(token);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<section class="card">
  <h2>{t('bots.title')}</h2>
  {#if !bot}
    {@const [before, after] = around('bots.pitch', 'link')}
    <p>{before}<a href={GUIDE}>{t('bots.api')}</a>{after}</p>
    <p class="muted">{t('bots.fresh')}</p>
    <form onsubmit={becomeBot}>
      <label>
        {t('account.yourPassword')}
        <input type="password" bind:value={password} autocomplete="current-password" required />
      </label>
      <button class="button">{t('bots.become')}</button>
    </form>
  {:else}
    {@const [before, after] = around('bots.isBot', 'link')}
    <p>{before}<a href={GUIDE}>{t('bots.guide')}</a>{after}</p>
    {#if token}
      <p><strong>{t('bots.newToken')}</strong></p>
      <div class="row">
        <input readonly value={token} aria-label={t('bots.token')} />
        <button class="button primary" onclick={copy}
          >{t(copied ? 'common.copied' : 'common.copy')}</button
        >
      </div>
    {/if}
    <div class="actions">
      <button class="button" onclick={newToken}>
        {t(hasToken ? 'bots.replace' : 'bots.create')}
      </button>
      {#if hasToken}
        <button
          class="button"
          onclick={() =>
            run(() => api('POST', '/api/account/token/revoke').then(() => (token = '')))}
          >{t('bots.revoke')}</button
        >
      {/if}
    </div>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  form {
    display: grid;
    gap: 0.75rem;
    max-width: 22rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .row input {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, monospace;
  }

  .error {
    color: var(--blunder);
  }
</style>
