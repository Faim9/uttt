<script lang="ts">
  import { parsePosition, play, type Position } from '@uttt/core';
  import Board from '#lib/Board.svelte';
  import { LESSONS } from '#lib/lessons.ts';
  import { playSound } from '#lib/sound.svelte.ts';

  /** The lesson shown; LESSONS.length once they're all done. */
  let index = $state(0);
  let position = $state.raw<Position>(parsePosition(LESSONS[0].position));
  let lastMove = $state<number | null>(null);
  let hint = $state('');
  let done = $state(false);

  const lesson = $derived(LESSONS[index] as (typeof LESSONS)[number] | undefined);

  function open(next: number) {
    index = next;
    hint = '';
    done = false;
    lastMove = null;
    if (LESSONS[next]) position = parsePosition(LESSONS[next].position);
  }

  /** Right moves are played; wrong ones get a hint and stay off the board. */
  function onmove(move: number) {
    if (!lesson) return;
    const result = lesson.check(position, move);
    if (result !== true) {
      hint = result;
      playSound('wrong');
      return;
    }
    position = play(position, move);
    lastMove = move;
    hint = '';
    done = true;
    playSound('solved');
  }
</script>

<div class="board-layout">
  <Board {position} {lastMove} disabled={done || !lesson} {onmove} />

  <div class="panel">
    <section class="card">
      <p
        class="steps"
        aria-label="Lesson {Math.min(index + 1, LESSONS.length)} of {LESSONS.length}"
      >
        {#each LESSONS as step, i (step.title)}
          <button
            class="step"
            class:passed={i < index}
            aria-current={i === index ? 'step' : undefined}
            aria-label="Lesson {i + 1}: {step.title}"
            onclick={() => open(i)}
          ></button>
        {/each}
      </p>
      {#if lesson}
        <h1>{lesson.title}</h1>
        <p>{lesson.text}</p>
        <p class="task">{lesson.task}</p>
        {#if done}
          <p class="right" role="status">{lesson.done}</p>
          <button class="button primary" onclick={() => open(index + 1)}>
            {index + 1 < LESSONS.length ? 'Next lesson' : 'Finish'}
          </button>
        {:else if hint}
          <p class="wrong" role="alert">{hint}</p>
        {/if}
      {:else}
        <h1>You know the rules!</h1>
        <p>The best way to get better is to play. Some ideas:</p>
        <div class="actions">
          <a class="button primary" href="/">Play online</a>
          <a class="button" href="/computer">Play the computer</a>
          <a class="button" href="/puzzles">Solve puzzles</a>
        </div>
        <button class="link" onclick={() => open(0)}>Start the lessons again</button>
      {/if}
    </section>
  </div>
</div>

<style>
  h1 {
    margin: 0.25rem 0 0.5rem;
    font-size: 1.4rem;
  }

  .steps {
    display: flex;
    gap: 0.35rem;
    margin: 0;
  }

  .step {
    width: 1.6rem;
    height: 0.45rem;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: var(--border);
    cursor: pointer;
  }

  .step.passed {
    background: var(--hint);
  }

  .step[aria-current='step'] {
    background: var(--accent);
  }

  .task {
    font-weight: 600;
  }

  .right {
    color: var(--hint);
    font-weight: 600;
  }

  .wrong {
    color: var(--blunder);
    font-weight: 600;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.75rem 0;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
