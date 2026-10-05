<script lang="ts">
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
    const sure = confirm(
      'Turn this account into a bot, for good? It will play only through the API, carry a BOT label, and be ranked apart from people.',
    );
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
  <h2>Bot account</h2>
  {#if !bot}
    <p>
      Wrote a program that plays? A bot account lets it play through the <a href={GUIDE}>bot API</a
      >. Bots carry a <span class="bot-tag">BOT</span> label, play people only in casual games, and are
      ranked among themselves.
    </p>
    <p class="muted">
      Only an account that hasn't played yet can become a bot, and it can't be turned back. Create a
      new account for your bot rather than using your own.
    </p>
    <form onsubmit={becomeBot}>
      <label>
        Your password
        <input type="password" bind:value={password} autocomplete="current-password" required />
      </label>
      <button class="button">Turn this account into a bot</button>
    </form>
  {:else}
    <p>
      This is a bot account. Your program connects with an API token: see the <a href={GUIDE}
        >bot API guide</a
      >.
    </p>
    {#if token}
      <p><strong>Your new token</strong>, shown only this once. Keep it secret, like a password:</p>
      <div class="row">
        <input readonly value={token} aria-label="API token" />
        <button class="button primary" onclick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
      </div>
    {/if}
    <div class="actions">
      <button class="button" onclick={newToken}>
        {hasToken ? 'Replace the token' : 'Create a token'}
      </button>
      {#if hasToken}
        <button
          class="button"
          onclick={() =>
            run(() => api('POST', '/api/account/token/revoke').then(() => (token = '')))}
          >Revoke the token</button
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
