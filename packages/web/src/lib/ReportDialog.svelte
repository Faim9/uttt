<script lang="ts">
  import { REPORT_REASONS, type ReportReason } from '@uttt/core';
  import { t } from './i18n.svelte.ts';
  import { api } from './session.svelte.ts';

  /** Reports a player to the admins. */
  let { username }: { username: string } = $props();

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
  <h2 id="report-title">{t('report.title', { name: username })}</h2>
  {#if sent}
    <p>{t('report.thanks')}</p>
    <div class="actions">
      <button class="button primary" onclick={() => dialog.close()}>{t('common.close')}</button>
    </div>
  {:else}
    <form onsubmit={send}>
      <label>
        {t('report.what')}
        <select bind:value={reason}>
          {#each REPORT_REASONS as value (value)}
            <option {value}>{t(`report.reason.${value}`)}</option>
          {/each}
        </select>
      </label>
      <label>
        {t('report.details')}
        <textarea
          bind:value={details}
          rows="4"
          maxlength="1000"
          placeholder={t('report.placeholder')}
          required></textarea>
      </label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button type="button" class="button" onclick={() => dialog.close()}
          >{t('common.cancel')}</button
        >
        <button class="button primary">{t('report.send')}</button>
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
