<script lang="ts">
  import { goto } from '$app/navigation';
  import { authenticate } from './session.svelte.ts';

  let { mode }: { mode: 'login' | 'signup' } = $props();

  let fields = $state({ username: '', email: '', login: '', password: '' });
  let error = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      const { username, email, login, password } = fields;
      await authenticate(
        mode,
        mode === 'login' ? { login, password } : { username, email, password },
      );
      goto('/play');
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<form class="card" onsubmit={submit}>
  <h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>

  {#if mode === 'login'}
    <label>
      Username or email
      <input bind:value={fields.login} autocomplete="username" required />
    </label>
  {:else}
    <label>
      Username
      <input
        bind:value={fields.username}
        autocomplete="username"
        pattern={'[A-Za-z0-9_\\-]{3,20}'}
        title="3–20 letters, digits, _ or -"
        required
      />
    </label>
    <label>
      Email
      <input type="email" bind:value={fields.email} autocomplete="email" required />
    </label>
  {/if}
  <label>
    Password
    <input
      type="password"
      bind:value={fields.password}
      autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
      minlength={mode === 'signup' ? 8 : undefined}
      required
    />
  </label>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <button class="button primary" disabled={busy}>
    {mode === 'login' ? 'Sign in' : 'Sign up'}
  </button>
  <p class="muted">
    {#if mode === 'login'}
      New here? <a href="/signup">Create an account</a>
    {:else}
      Already have an account? <a href="/login">Sign in</a>
    {/if}
  </p>
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
