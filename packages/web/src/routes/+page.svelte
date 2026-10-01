<section class="hero">
  <h1>Ultimate Tic-Tac-Toe</h1>
  <p class="muted">Tic-tac-toe, nine boards deep. Play, analyze, improve.</p>
</section>

<section class="choices">
  <a class="card choice" href="/play">
    <h2>Play online</h2>
    <p>Quick pairing or a challenge link for a friend. Rated games with an account.</p>
  </a>
  <a class="card choice" href="/computer">
    <h2>Play the computer</h2>
    <p>Six strength levels, from first steps to a real challenge.</p>
  </a>
  <a class="card choice" href="/analysis">
    <h2>Analysis board</h2>
    <p>Explore positions and variations with the engine.</p>
  </a>
</section>

<section class="card rules">
  <h2>How to play</h2>
  <ol>
    <li>The board is nine small tic-tac-toe boards arranged in a 3×3 grid. X moves first.</li>
    <li>
      The cell you play sends your opponent to the matching board: play the top-right cell, and they
      must play in the top-right board.
    </li>
    <li>If that board is already won or full, they may play in any open board.</li>
    <li>Win a small board with three in a row. Win the game with three small boards in a row.</li>
  </ol>
  <p class="muted">
    Moves are written <strong>big board-small cell</strong>, both numbered 1–9 like a phone keypad:
    <code>5-3</code> is the center board, top-right cell.
  </p>
</section>

<style>
  .hero {
    text-align: center;
    margin: 2rem 0;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 6vw, 3rem);
  }

  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .choice {
    color: inherit;
    text-decoration: none;
  }

  .choice:hover {
    border-color: var(--accent);
  }

  .choice h2 {
    color: var(--text);
    font-size: 1.1rem;
    text-transform: none;
    letter-spacing: 0;
  }

  .choice p {
    margin: 0;
    color: var(--muted);
  }

  .rules ol {
    padding-left: 1.25rem;
  }
</style>
