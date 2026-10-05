<script lang="ts">
  import { CORRESPONDENCE, isTimeControl, TIME_CONTROLS } from '@uttt/core';
  import { timeControlName } from './game.ts';
  import { t } from './i18n.svelte.ts';

  /** Picks a time control: a preset, any minutes plus increment, and optionally days per move. */
  interface Props {
    /** Offer correspondence (days per move) too. */
    correspondence?: boolean;
    onchange: (timeControl: string) => void;
  }

  let { correspondence = false, onchange }: Props = $props();

  let minutes = $state(5);
  let increment = $state(3);
  /** Days per move, when a correspondence time control is picked. */
  let days = $state<number | null>(null);
  const timeControl = $derived(days ? `${days}d` : `${minutes}+${increment}`);

  $effect(() => onchange(timeControl));
</script>

<fieldset>
  <legend>{t('time.control')}</legend>
  <div class="presets">
    {#each TIME_CONTROLS as preset (preset)}
      <button
        class="button"
        aria-pressed={timeControl === preset}
        onclick={() => {
          [minutes, increment] = preset.split('+').map(Number);
          days = null;
        }}
      >
        {preset}
      </button>
    {/each}
  </div>
  {#if correspondence}
    <div class="presets" role="group" aria-label={t('category.correspondence')}>
      {#each CORRESPONDENCE as preset (preset)}
        <button
          class="button"
          aria-pressed={timeControl === preset}
          onclick={() => (days = parseInt(preset))}
        >
          {timeControlName(preset)}
        </button>
      {/each}
    </div>
  {/if}
  <div class="row">
    <label>
      {t('time.minutes')}
      <input type="number" min="1" max="60" bind:value={minutes} oninput={() => (days = null)} />
    </label>
    <label>
      {t('time.increment')}
      <input type="number" min="0" max="30" bind:value={increment} oninput={() => (days = null)} />
    </label>
  </div>
  {#if !isTimeControl(timeControl)}
    <p class="error">{t('time.range')}</p>
  {/if}
</fieldset>

<style>
  fieldset {
    display: grid;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 0.4rem;
    padding: 0;
    font-weight: 500;
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .presets .button {
    padding: 0.3rem 0.7rem;
  }

  .presets .button[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-text);
  }

  .row label {
    flex: 1;
  }

  .row input {
    flex: 1;
    min-width: 0;
  }
</style>
