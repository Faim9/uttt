<script lang="ts">
  import { api, session } from '#lib/session.svelte.ts';
  import TwoFactorSettings from '#lib/TwoFactorSettings.svelte';
  import AccountData from '#lib/AccountData.svelte';

  interface Account {
    username: string;
    email: string;
    emailVerified: boolean;
    twoFactor: boolean;
    sessions: {
      id: string;
      createdAt: string;
      lastSeenAt: string;
      userAgent: string;
      current: boolean;
    }[];
  }

  let account = $state<Account | null>(null);
  let error = $state('');
  let notice = $state('');
  let passwords = $state({ current: '', password: '' });

  $effect(() => {
    if (session.ready && session.user) load(api<Account>('GET', '/api/account'));
  });

  /** Runs an account request; every account endpoint answers with the updated overview. */
  async function load(request: Promise<Account>, success = '') {
    error = notice = '';
    try {
      account = await request;
      notice = success;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function changePassword(event: SubmitEvent) {
    event.preventDefault();
    await load(
      api<Account>('POST', '/api/account/password', passwords),
      'Password changed. Your other devices were signed out.',
    );
    if (!error) passwords = { current: '', password: '' };
  }

  // Most specific first: Edge's user agent also mentions Chrome and Safari, Android's mentions Linux.
  const BROWSERS: [RegExp, string][] = [
    [/Edg\//, 'Edge'],
    [/Firefox\//, 'Firefox'],
    [/Chrome\//, 'Chrome'],
    [/Safari\//, 'Safari'],
  ];
  const SYSTEMS: [RegExp, string][] = [
    [/Android/, 'Android'],
    [/iPhone|iPad/, 'iOS'],
    [/Windows/, 'Windows'],
    [/Mac OS X/, 'macOS'],
    [/Linux/, 'Linux'],
  ];

  /** A readable name for a user agent, e.g. "Firefox on Linux". */
  function device(userAgent: string): string {
    const find = (table: [RegExp, string][]) =>
      table.find(([pattern]) => pattern.test(userAgent))?.[1];
    return `${find(BROWSERS) ?? 'A browser'} on ${find(SYSTEMS) ?? 'an unknown system'}`;
  }

  const date = (iso: string) => new Date(iso).toLocaleString();
</script>

<h1>Settings</h1>

{#if session.ready && !session.user}
  <p>Please <a href="/login">sign in</a> to manage your account.</p>
{:else if account}
  {#if error}<p class="card message error" role="alert">{error}</p>{/if}
  {#if notice}<p class="card message" role="status">{notice}</p>{/if}

  <section class="card">
    <h2>Account</h2>
    <p><strong>{account.username}</strong> · {account.email}</p>
    {#if account.emailVerified}
      <p class="muted">Email confirmed.</p>
    {:else}
      <p>
        Confirm your email to play rated games: follow the link we sent you.
        <button
          class="button"
          onclick={() =>
            load(
              api<Account>('POST', '/api/account/verify-email'),
              `We sent a new link to ${account?.email}.`,
            )}
        >
          Send a new link
        </button>
      </p>
    {/if}
  </section>

  <section class="card">
    <h2>Password</h2>
    <form onsubmit={changePassword}>
      <label>
        Current password
        <input
          type="password"
          bind:value={passwords.current}
          autocomplete="current-password"
          required
        />
      </label>
      <label>
        New password
        <input
          type="password"
          bind:value={passwords.password}
          autocomplete="new-password"
          minlength="8"
          required
        />
      </label>
      <button class="button primary">Change password</button>
    </form>
  </section>

  <TwoFactorSettings
    enabled={account.twoFactor}
    onchange={() => load(api<Account>('GET', '/api/account'))}
  />

  <section class="card">
    <h2>Signed-in devices</h2>
    <ul class="sessions">
      {#each account.sessions as s (s.id)}
        <li>
          <div>
            <strong title={s.userAgent}>{device(s.userAgent)}</strong>
            {#if s.current}<span class="badge">This device</span>{/if}
            <div class="muted">
              Signed in {date(s.createdAt)} · last active {date(s.lastSeenAt)}
            </div>
          </div>
          {#if !s.current}
            <button
              class="button"
              onclick={() =>
                load(api<Account>('POST', '/api/account/sessions/revoke', { id: s.id }))}
            >
              Sign out
            </button>
          {/if}
        </li>
      {/each}
    </ul>
    {#if account.sessions.length > 1}
      <button
        class="button"
        onclick={() =>
          load(
            api<Account>('POST', '/api/account/sessions/revoke-others'),
            'All other devices were signed out.',
          )}
      >
        Sign out all other devices
      </button>
    {/if}
  </section>

  <AccountData twoFactor={account.twoFactor} />
{:else}
  <p class="muted">{error || 'Loading…'}</p>
{/if}

<style>
  h1 {
    margin-top: 0;
  }

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

  .sessions {
    margin: 0 0 0.75rem;
    padding: 0;
    list-style: none;
  }

  .sessions li {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
  }

  .badge {
    margin-left: 0.5rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: var(--last);
    font-size: 0.8rem;
  }

  .muted {
    font-size: 0.85rem;
  }

  .message {
    margin: 0 0 1rem;
  }

  .error {
    border-color: var(--o);
  }
</style>
