<!-- The UTTT mark: a tic-tac-toe grid with an X in the middle and an O in the corner it sends you to. -->
<svg viewBox="0 0 40 40" aria-hidden="true">
  <path class="grid" d="M15.3 5v30M24.7 5v30M5 15.3h30M5 24.7h30" />
  <path class="x" d="M17.3 17.3l5.4 5.4M22.7 17.3l-5.4 5.4" />
  <circle class="o" cx="29.9" cy="10.1" r="2.9" />
</svg>

<style>
  svg {
    width: 1.9rem;
    height: 1.9rem;
    fill: none;
    stroke-linecap: round;
    stroke-width: 2.8;
  }

  .grid {
    stroke: var(--accent);
  }

  .x {
    stroke: var(--x);
    stroke-width: 3.2;
  }

  .o {
    stroke: var(--o);
  }
</style>
