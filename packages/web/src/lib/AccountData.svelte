<script lang="ts">
  import { goto } from '$app/navigation';
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
  <h2>Your data</h2>
  <p>
    Download everything stored about you: your account, devices, ratings, and games.
    <a class="button" href="/api/account/export" download>Download my data</a>
  </p>

  <details>
    <summary>Delete my account</summary>
    <p>
      This deletes your account, ratings, and sessions for good. Your games stay in your opponents'
      histories, without your name. It can't be undone.
    </p>
    <form onsubmit={remove}>
      <label>
        Password
        <input type="password" bind:value={password} autocomplete="current-password" required />
      </label>
      {#if twoFactor}
        <label>
          Authentication code
          <input bind:value={code} autocomplete="one-time-code" required />
        </label>
      {/if}
      <label class="confirm">
        <input type="checkbox" bind:checked={confirmed} required />
        I understand this can't be undone
      </label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="button danger" disabled={!confirmed}>Delete my account</button>
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
