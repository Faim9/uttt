<script lang="ts">
  import { parsePosition, play, type Position } from '@uttt/core';
  import Board from '#lib/Board.svelte';
  import { t, type Key } from '#lib/i18n.svelte.ts';
  import { LESSONS, type Hint } from '#lib/lessons.ts';
  import { learned } from '#lib/newcomer.svelte.ts';
  import { playSound } from '#lib/sound.svelte.ts';

  /** The lesson shown; LESSONS.length once they're all done. */
  let index = $state(0);
  let position = $state.raw<Position>(parsePosition(LESSONS[0].position));
  let lastMove = $state<number | null>(null);
  let hint = $state<Hint | null>(null);
  let done = $state(false);

  const lesson = $derived(LESSONS[index] as (typeof LESSONS)[number] | undefined);

  /** A hint's words; a board number in it becomes the board's name ("the top-left board"). */
  function hintText({ key, params = {} }: Hint): string {
    const { board } = params;
    const named = board === undefined ? params : { ...params, board: t(`board.${board}` as Key) };
    return t(key as Key, named);
  }

  function open(next: number) {
    index = next;
    hint = null;
    done = false;
    lastMove = null;
    if (LESSONS[next]) position = parsePosition(LESSONS[next].position);
    else learned();
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
    hint = null;
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
        aria-label={t('learn.steps', {
          n: Math.min(index + 1, LESSONS.length),
          total: LESSONS.length,
        })}
      >
        {#each LESSONS as step, i (step.id)}
          <button
            class="step"
            class:passed={i < index}
            aria-current={i === index ? 'step' : undefined}
            aria-label={t('learn.step', { n: i + 1, title: t(`lesson.${step.id}.title`) })}
            onclick={() => open(i)}
          ></button>
        {/each}
      </p>
      {#if lesson}
        <h1>{t(`lesson.${lesson.id}.title`)}</h1>
        <p>{t(`lesson.${lesson.id}.text`)}</p>
        <p class="task">{t(`lesson.${lesson.id}.task`)}</p>
        {#if done}
          <p class="right" role="status">{t(`lesson.${lesson.id}.done`)}</p>
          <button class="button primary" onclick={() => open(index + 1)}>
            {t(index + 1 < LESSONS.length ? 'learn.next' : 'learn.finish')}
          </button>
        {:else if hint}
          <p class="wrong" role="alert">{hintText(hint)}</p>
        {/if}
      {:else}
        <h1>{t('learn.doneTitle')}</h1>
        <p>{t('learn.doneText')}</p>
        <div class="actions">
          <a class="button primary" href="/">{t('learn.playOnline')}</a>
          <a class="button" href="/computer">{t('learn.playComputer')}</a>
          <a class="button" href="/puzzles">{t('learn.puzzles')}</a>
        </div>
        <button class="link" onclick={() => open(0)}>{t('learn.again')}</button>
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
