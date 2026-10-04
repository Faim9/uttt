<script lang="ts">
  /** A player's rating over time in one category: a line, with a crosshair readout and a table view. */
  let { points }: { points: { rating: number; at: string }[] } = $props();

  const HEIGHT = 200;
  const PAD = { top: 12, right: 12, bottom: 24, left: 44 };
  /** Gridline spacing, in rating points. */
  const STEP = 50;

  let active = $state<number | null>(null);
  /** Drawn at the container's real width, so text stays at its CSS size. */
  let width = $state(600);

  const times = $derived(points.map((point) => new Date(point.at).getTime()));
  const low = $derived(Math.floor((Math.min(...points.map((p) => p.rating)) - 10) / STEP) * STEP);
  const high = $derived(Math.ceil((Math.max(...points.map((p) => p.rating)) + 10) / STEP) * STEP);
  const ticks = $derived(
    Array.from({ length: (high - low) / STEP + 1 }, (_, i) => low + i * STEP).filter(
      (_, i, all) => all.length <= 6 || i % Math.ceil(all.length / 5) === 0,
    ),
  );

  const x = (i: number) => {
    const [first, last] = [times[0], times[times.length - 1]];
    const span = last - first || 1;
    return PAD.left + ((times[i] - first) / span) * (width - PAD.left - PAD.right);
  };
  const y = (rating: number) =>
    PAD.top + ((high - rating) / (high - low)) * (HEIGHT - PAD.top - PAD.bottom);

  const path = $derived(
    points.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(point.rating)}`).join(' '),
  );
  /** Axis labels show dates, or times when every game was within a day or two. */
  const label = (i: number) =>
    times[times.length - 1] - times[0] < 2 * 86_400_000
      ? new Date(times[i]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : new Date(times[i]).toLocaleDateString();
  const date = (i: number) =>
    new Date(times[i]).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  /** The game the readout is on, for screen readers: the hovered one, else the latest. */
  const shown = $derived(active ?? points.length - 1);

  /** Snaps the crosshair to the game nearest the pointer. */
  function track(event: PointerEvent) {
    const svg = event.currentTarget as SVGSVGElement;
    const box = svg.getBoundingClientRect();
    const pointer = ((event.clientX - box.left) / box.width) * width;
    let nearest = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(i) - pointer) < Math.abs(x(nearest) - pointer)) nearest = i;
    }
    active = nearest;
  }

  function step(event: KeyboardEvent) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const from = active ?? points.length - 1;
    active = Math.min(points.length - 1, Math.max(0, from + moves[event.key]));
  }
</script>

{#if points.length < 2}
  <p class="muted">The graph appears after a couple of rated games.</p>
{:else}
  <div class="graph" bind:clientWidth={width}>
    <svg
      viewBox="0 0 {width} {HEIGHT}"
      role="slider"
      aria-label="Rating after each rated game; use the arrow keys to move between games"
      aria-valuemin={1}
      aria-valuemax={points.length}
      aria-valuenow={shown + 1}
      aria-valuetext="{points[shown].rating} on {date(shown)}"
      tabindex="0"
      onpointermove={track}
      onpointerleave={() => (active = null)}
      onkeydown={step}
      onblur={() => (active = null)}
    >
      {#each ticks as tick (tick)}
        <line class="grid" x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} />
        <text
          class="axis"
          x={PAD.left - 8}
          y={y(tick)}
          text-anchor="end"
          dominant-baseline="middle"
        >
          {tick}
        </text>
      {/each}
      <text class="axis" x={PAD.left} y={HEIGHT - 6}>{label(0)}</text>
      <text class="axis" x={width - PAD.right} y={HEIGHT - 6} text-anchor="end">
        {label(points.length - 1)}
      </text>
      <path class="line" d={path} />
      {#if active !== null}
        <line
          class="crosshair"
          x1={x(active)}
          x2={x(active)}
          y1={PAD.top}
          y2={HEIGHT - PAD.bottom}
        />
        <circle class="marker" cx={x(active)} cy={y(points[active].rating)} r="5" />
      {/if}
    </svg>
    {#if active !== null}
      <div
        class="tooltip"
        style:left="{x(active)}px"
        class:flip={x(active) > width * 0.7}
        role="status"
      >
        <strong>{points[active].rating}</strong>
        <span class="muted">{date(active)}</span>
      </div>
    {/if}
  </div>
  <details>
    <summary>Show as table</summary>
    <table>
      <thead><tr><th>Date</th><th>Rating</th></tr></thead>
      <tbody>
        {#each points as point, i (i)}
          <tr><td>{date(i)}</td><td>{point.rating}</td></tr>
        {/each}
      </tbody>
    </table>
  </details>
{/if}

<style>
  .graph {
    position: relative;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
    touch-action: none;
  }

  svg:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 4px;
    border-radius: 4px;
  }

  .grid {
    stroke: var(--border);
    stroke-width: 1;
  }

  .axis {
    fill: var(--muted);
    font-size: 12px;
  }

  .line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .crosshair {
    stroke: var(--line-strong);
    stroke-width: 1;
  }

  .marker {
    fill: var(--accent);
    stroke: var(--surface);
    stroke-width: 2;
  }

  .tooltip {
    position: absolute;
    top: 0;
    display: grid;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow);
    pointer-events: none;
    transform: translateX(12px);
    white-space: nowrap;
  }

  .tooltip.flip {
    transform: translateX(calc(-100% - 12px));
  }

  details {
    margin-top: 0.5rem;
    font-size: 0.9rem;
  }

  summary {
    color: var(--muted);
    cursor: pointer;
  }

  table {
    margin-top: 0.5rem;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.2rem 1.5rem 0.2rem 0;
    text-align: left;
  }

  th {
    color: var(--muted);
    font-weight: 500;
  }
</style>
