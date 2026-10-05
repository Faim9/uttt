<script lang="ts">
  import { FEEDBACK_KINDS, type FeedbackKind } from '@uttt/core';
  import { around, t } from '#lib/i18n.svelte.ts';
  import { api, session } from '#lib/session.svelte.ts';

  interface Sent {
    id: number;
    kind: FeedbackKind;
    text: string;
    createdAt: string;
    doneAt: string | null;
  }

  const ISSUES_URL = 'https://github.com/Faim9/uttt/issues';

  let kind = $state<FeedbackKind>('idea');
  let text = $state('');
  let error = $state('');
  let thanks = $state(false);
  let sent = $state<Sent[]>([]);
  const [githubBefore, githubAfter] = $derived(around('feedback.github', 'link'));

  const load = () => api<Sent[]>('GET', '/api/feedback').then((list) => (sent = list));

  $effect(() => {
    if (session.user) load().catch(() => {});
  });

  async function send(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    try {
      await api('POST', '/api/feedback', { kind, text });
      text = '';
      thanks = true;
      await load();
    } catch (e) {
      error = (e as Error).message;
    }
  }
</script>

<h1>{t('feedback.title')}</h1>
<p class="muted">{t('feedback.intro')}</p>

<section class="card">
  {#if !session.ready}
    <p class="muted">{t('common.loading')}</p>
  {:else if !session.user}
    {@const [before, after] = around('feedback.signIn', 'link')}
    <p>{before}<a href="/login">{t('nav.signIn')}</a>{after}</p>
  {:else if !session.user.emailVerified}
    <p>{t('error.confirmToSendFeedback')}</p>
  {:else}
    <form onsubmit={send}>
      <div class="kinds" role="group" aria-label={t('feedback.kind')}>
        {#each FEEDBACK_KINDS as value (value)}
          <button
            type="button"
            class="button"
            aria-pressed={kind === value}
            onclick={() => (kind = value)}>{t(`feedback.kind.${value}`)}</button
          >
        {/each}
      </div>
      <label>
        {t(`feedback.prompt.${kind}`)}
        <textarea
          bind:value={text}
          rows="6"
          maxlength="2000"
          required
          oninput={() => (thanks = false)}></textarea>
      </label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      {#if thanks}<p role="status">{t('feedback.thanks')}</p>{/if}
      <button class="button primary">{t('feedback.send')}</button>
    </form>
  {/if}
  <p class="muted github">{githubBefore}<a href={ISSUES_URL}>GitHub</a>{githubAfter}</p>
</section>

{#if sent.length > 0}
  <h2>{t('feedback.yours')}</h2>
  <ul class="sent">
    {#each sent as item (item.id)}
      <li class="card">
        <p class="muted">
          {t(`feedback.kind.${item.kind}`)} · {new Date(item.createdAt).toLocaleDateString()} ·
          <strong>{t(item.doneAt ? 'feedback.done' : 'feedback.open')}</strong>
        </p>
        <p class="text">{item.text}</p>
      </li>
    {/each}
  </ul>
{/if}

<style>
  h1 {
    margin-top: 0;
  }

  h2 {
    margin-top: 1.5rem;
    font-size: 1.1rem;
  }

  section {
    max-width: 40rem;
  }

  form {
    display: grid;
    gap: 0.9rem;
    justify-items: start;
  }

  label {
    display: grid;
    gap: 0.3rem;
    width: 100%;
  }

  textarea {
    resize: vertical;
  }

  form p {
    margin: 0;
  }

  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .kinds .button[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-text);
  }

  .github {
    margin-bottom: 0;
  }

  .sent {
    display: grid;
    gap: 0.75rem;
    max-width: 40rem;
    padding: 0;
    list-style: none;
  }

  .sent p {
    margin: 0;
  }

  .text {
    margin-top: 0.4rem !important;
    white-space: pre-wrap;
  }
</style>
