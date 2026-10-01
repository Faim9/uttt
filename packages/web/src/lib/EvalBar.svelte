<script lang="ts">
  /** X's win chance, 0–1, or null when there is no evaluation. */
  let { winChance }: { winChance: number | null } = $props();

  const percent = $derived(winChance === null ? 50 : Math.round(winChance * 100));
</script>

<div
  class="bar"
  role="meter"
  aria-label="X win chance"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={percent}
>
  <div class="x" style:height="{percent}%"></div>
  <span class:faded={winChance === null}>{percent}</span>
</div>

<style>
  .bar {
    position: relative;
    display: flex;
    flex-direction: column-reverse;
    width: 1.75rem;
    border-radius: 6px;
    overflow: hidden;
    background: var(--o);
  }

  .x {
    background: var(--x);
    transition: height 0.3s;
  }

  span {
    position: absolute;
    inset: auto 0 0.25rem;
    text-align: center;
    font-size: 0.7rem;
    font-weight: 600;
    color: white;
  }

  .faded {
    opacity: 0.5;
  }
</style>
