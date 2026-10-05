<script lang="ts">
  import { goto } from '$app/navigation';
  import { isTimeControl } from '@uttt/core';
  import { t } from './i18n.svelte.ts';
  import { api } from './session.svelte.ts';
  import TimeControlPicker from './TimeControlPicker.svelte';

  /** Schedules an arena tournament, then opens its page. Admins schedule the official ones. */
  let { official = false }: { official?: boolean } = $props();

  const LENGTHS = [30, 60, 90, 120, 180];

  /** The next full hour, as a datetime-local input wants it (local time, no zone). */
  function nextHour(): string {
    const hour = 3_600_000;
    const local = Date.now() - new Date().getTimezoneOffset() * 60_000;
    return new Date((Math.floor(local / hour) + 1) * hour).toISOString().slice(0, 16);
  }

  let name = $state('');
  let timeControl = $state('5+3');
  let startsAt = $state(nextHour());
  let minutes = $state(60);
  let rated = $state(true);
  let error = $state('');

  async function create(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    try {
      const body = { name, timeControl, rated, minutes, official };
      const { id } = await api<{ id: string }>('POST', '/api/tournaments', {
        ...body,
        startsAt: new Date(startsAt).toISOString(),
      });
      await goto(`/tournaments/${id}`);
    } catch (e) {
      error = (e as Error).message;
    }
  }
</script>

<form onsubmit={create}>
  <label>
    {t('tournaments.name')}
    <input
      bind:value={name}
      maxlength="60"
      placeholder={t('tournaments.namePlaceholder')}
      required
    />
  </label>
  <TimeControlPicker onchange={(value) => (timeControl = value)} />
  <div class="row">
    <label>
      {t('tournaments.starts')}
      <input type="datetime-local" bind:value={startsAt} required />
    </label>
    <label>
      {t('tournaments.length')}
      <select bind:value={minutes}>
        {#each LENGTHS as length (length)}
          <option value={length}>{t('countdown.minutes', { m: length })}</option>
        {/each}
      </select>
    </label>
  </div>
  <label class="check"><input type="checkbox" bind:checked={rated} /> {t('game.rated')}</label>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <button class="button primary" disabled={!isTimeControl(timeControl)}>
    {t('tournaments.create')}
  </button>
</form>

<style>
  form {
    display: grid;
    gap: 0.8rem;
    justify-items: start;
  }

  label {
    display: grid;
    gap: 0.25rem;
  }

  input:not([type='checkbox']) {
    max-width: 24rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .check {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
</style>
