<script lang="ts">
  import { REPORT_REASONS, type ReportReason } from '@uttt/core';
  import { api } from './session.svelte.ts';

  /** Reports a player to the admins. */
  let { username }: { username: string } = $props();

  const LABELS: Record<ReportReason, string> = {
    cheating: 'Cheating (using an engine or help)',
    abuse: 'Insults, harassment, or threats',
    username: 'Offensive username',
    other: 'Something else',
  };

  let dialog: HTMLDialogElement;
  let reason = $state<ReportReason>('cheating');
  let details = $state('');
  let error = $state('');
  let sent = $state(false);

  export function open() {
    error = '';
    sent = false;
    dialog.showModal();
  }

  async function send(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    try {
      await api('POST', '/api/reports', { username, reason, details });
      sent = true;
      details = '';
    } catch (e) {
      error = (e as Error).message;
    }
  }
</script>

<dialog bind:this={dialog} aria-labelledby="report-title">
  <h2 id="report-title">Report {username}</h2>
  {#if sent}
    <p>Thanks. An admin will look at it.</p>
    <div class="actions">
      <button class="button primary" onclick={() => dialog.close()}>Close</button>
    </div>
  {:else}
    <form onsubmit={send}>
      <label>
        What's wrong?
        <select bind:value={reason}>
          {#each REPORT_REASONS as value (value)}
            <option {value}>{LABELS[value]}</option>
          {/each}
        </select>
      </label>
      <label>
        Details
        <textarea
          bind:value={details}
          rows="4"
          maxlength="1000"
          placeholder="Which game, what happened…"
          required></textarea>
      </label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button type="button" class="button" onclick={() => dialog.close()}>Cancel</button>
        <button class="button primary">Send report</button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  form {
    display: grid;
    gap: 0.9rem;
  }

  textarea {
    resize: vertical;
  }
</style>
