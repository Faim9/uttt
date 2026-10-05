<script lang="ts">
  import { page } from '$app/state';
  import {
    formatGame,
    formatMove,
    formatPosition,
    initialPosition,
    parseGame,
    parseMove,
    parsePosition,
    startOf,
    type Analysis,
    type GameState,
  } from '@uttt/core';
  import Board from '#lib/Board.svelte';
  import { Engine } from '#lib/engine.ts';
  import EvalBar from '#lib/EvalBar.svelte';
  import EvalGraph from '#lib/EvalGraph.svelte';
  import MoveTree from '#lib/MoveTree.svelte';
  import ReviewPanel from '#lib/ReviewPanel.svelte';
  import { GameReview } from '#lib/review.ts';
  import { api } from '#lib/session.svelte.ts';
  import { GameTree, type TreeNode } from '#lib/tree.svelte.ts';
  import { onDestroy } from 'svelte';

  /** Caps memory use: the search tree grows by one node per playout. */
  const MAX_PLAYOUTS = 1_000_000;
  const INITIAL = formatPosition(initialPosition);

  let error = $state('');
  let tree = $state.raw(treeFromUrl());
  let engineOn = $state(true);
  let analysis = $state.raw<Analysis | null>(null);
  let importText = $state('');
  let copied = $state('');
  let review = $state.raw<GameReview | null>(null);

  const position = $derived(tree.current.position);
  const start = $derived(formatPosition(tree.root.position));

  const engine = new Engine();
  onDestroy(() => {
    engine.destroy();
    review?.cancel();
  });

  // Links from finished games add `review`, so the review starts right away.
  if (page.url.searchParams.has('review')) startReview();

  $effect(() => {
    analysis = null;
    // A running review needs every core; live analysis resumes when it's done.
    const reviewing = review !== null && !review.done;
    if (!engineOn || reviewing || position.outcome !== null) return engine.stop();
    engine.analyze(position, MAX_PLAYOUTS, (update) => (analysis = update));
  });

  /** Shared links look like /analysis?moves=5-5+5-1, optionally with a starting `position`. */
  function treeFromUrl(): GameTree {
    const params = page.url.searchParams;
    try {
      const start = params.get('position');
      const moves = (params.get('moves') ?? '').split(' ').filter(Boolean).map(parseMove);
      return new GameTree(start ? parsePosition(start) : initialPosition, moves);
    } catch (e) {
      error = `Couldn't load the shared position: ${(e as Error).message}`;
      return new GameTree();
    }
  }

  /**
   * Links from online games add `game`, so the moves show each player's time left. Only the moves that
   * still follow the game get one; explored variations don't.
   */
  let gameClocks = $state.raw<{ moves: number[]; clockHistory: number[] } | null>(null);
  const gameId = page.url.searchParams.get('game');
  if (gameId) {
    api<GameState>('GET', `/api/games/${encodeURIComponent(gameId)}`).then(
      (game) => (gameClocks = game),
      () => {}, // Without the game, the review just has no clock times.
    );
  }
  /** The main line's moves for as long as it follows the game: these get the game's clock times. */
  const followed = $derived.by(() => {
    if (!gameClocks || tree.root.position !== initialPosition) return [];
    const { moves } = gameClocks;
    const line = tree.root.mainLine;
    const diverges = line.findIndex((node, i) => node.move !== moves[i]);
    return diverges < 0 ? line : line.slice(0, diverges);
  });
  const clockAfter = (node: TreeNode) => {
    const i = followed.indexOf(node);
    return i < 0 ? null : (gameClocks?.clockHistory[i] ?? null);
  };

  function startReview(): void {
    review?.cancel();
    review = new GameReview(tree.root);
  }

  function setTree(next: GameTree): void {
    review?.cancel();
    review = null;
    tree = next;
  }

  function load(): void {
    const text = importText.trim();
    try {
      if (text.includes('/') && !text.includes('[')) {
        setTree(new GameTree(parsePosition(text)));
      } else {
        const record = parseGame(text);
        setTree(new GameTree(startOf(record.tags), record.moves));
      }
      importText = '';
      error = '';
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function gameRecord(): string {
    const tags: Record<string, string> = start === INITIAL ? {} : { Position: start };
    return formatGame({ tags, moves: tree.moves });
  }

  function shareLink(): string {
    const moves = tree.moves.map(formatMove).join(' ');
    const params = new URLSearchParams(start === INITIAL ? { moves } : { position: start, moves });
    return `${location.origin}/analysis?${params}`;
  }

  async function copy(label: string, text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    copied = label;
    setTimeout(() => (copied = ''), 1500);
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    const actions: Record<string, () => void> = {
      ArrowLeft: () => tree.back(),
      ArrowRight: () => tree.forward(),
      Home: () => tree.toStart(),
      End: () => tree.toEnd(),
    };
    if (actions[event.key]) {
      event.preventDefault();
      actions[event.key]();
    }
  }

  function status(): string {
    if (position.outcome === 'draw') return 'Draw';
    if (position.outcome) return `${position.outcome.toUpperCase()} wins`;
    const where = position.forced === null ? 'any board' : `board ${position.forced + 1}`;
    return `${position.turn.toUpperCase()} to move · ${where}`;
  }
</script>

<svelte:window {onkeydown} />

<div class="board-layout">
  <div class="board-column">
    <div class="board-with-eval">
      <EvalBar
        winChance={position.outcome
          ? { x: 1, o: 0, draw: 0.5 }[position.outcome]
          : (analysis?.winChance ?? null)}
      />
      <Board
        {position}
        lastMove={tree.current.move}
        hint={engineOn ? analysis?.bestMove : null}
        onmove={(move) => tree.play(move)}
      />
    </div>
    {#if review}
      <EvalGraph {review} current={tree.current} ongoto={(node) => tree.goTo(node)} />
    {/if}
  </div>

  <div class="panel">
    {#if error}
      <p class="card error" role="alert">{error}</p>
    {/if}

    {#if review}
      <ReviewPanel {review} {tree} />
    {/if}

    <section class="card">
      <h2>Engine</h2>
      <label class="toggle">
        <input type="checkbox" bind:checked={engineOn} /> Show engine analysis
      </label>
      <p class="status">{status()}</p>
      {#if engineOn && analysis}
        <p>
          <strong>X {Math.round(analysis.winChance * 100)}%</strong>
          <span class="muted">· {Math.round(analysis.playouts / 1000)}k playouts</span>
        </p>
        <p class="pv">{analysis.pv.map(formatMove).join(' ')}</p>
      {/if}
    </section>

    <section class="card">
      <h2>Moves</h2>
      <MoveTree {tree} judge={(node) => review?.of(node)?.judgement ?? null} clock={clockAfter} />
      <div class="controls">
        <button class="button" aria-label="First move" onclick={() => tree.toStart()}>⏮</button>
        <button class="button" aria-label="Previous move" onclick={() => tree.back()}>◀</button>
        <button class="button" aria-label="Next move" onclick={() => tree.forward()}>▶</button>
        <button class="button" aria-label="Last move" onclick={() => tree.toEnd()}>⏭</button>
        <button
          class="button primary"
          disabled={tree.root.children.length === 0}
          onclick={startReview}>{review ? 'Review again' : 'Review game'}</button
        >
      </div>
      <div class="controls">
        <button
          class="button"
          disabled={!tree.current.parent}
          onclick={() => tree.promote(tree.current)}>Promote</button
        >
        <button
          class="button"
          disabled={!tree.current.parent}
          onclick={() => tree.delete(tree.current)}>Delete from here</button
        >
      </div>
    </section>

    <section class="card">
      <h2>Share &amp; import</h2>
      <div class="controls">
        <button class="button" onclick={() => copy('link', shareLink())}>
          {copied === 'link' ? 'Copied!' : 'Copy link'}
        </button>
        <button class="button" onclick={() => copy('game', gameRecord())}>
          {copied === 'game' ? 'Copied!' : 'Copy game'}
        </button>
        <button class="button" onclick={() => copy('position', formatPosition(position))}>
          {copied === 'position' ? 'Copied!' : 'Copy position'}
        </button>
      </div>
      <textarea
        bind:value={importText}
        rows="3"
        placeholder="Paste a game record or position string"
        aria-label="Game record or position string to import"></textarea>
      <div class="controls">
        <button class="button primary" disabled={!importText.trim()} onclick={load}>Load</button>
        <button class="button" onclick={() => setTree(new GameTree())}>New board</button>
        <a
          class="button"
          href="/editor?{new URLSearchParams({ position: formatPosition(position) })}"
          >Board editor</a
        >
      </div>
    </section>
  </div>
</div>

<style>
  .board-column {
    display: grid;
    gap: 0.75rem;
  }

  .board-with-eval {
    display: flex;
    gap: 0.75rem;
  }

  .board-with-eval > :global(.board) {
    flex: 1;
  }

  .toggle {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .status {
    font-weight: 600;
  }

  .pv {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    word-spacing: 0.2rem;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  textarea {
    width: 100%;
    margin-top: 0.75rem;
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    font-family: ui-monospace, monospace;
    font-size: 0.85rem;
  }

  .error {
    margin: 0;
    border-color: var(--o);
  }

  p {
    margin: 0.5rem 0 0;
  }
</style>
