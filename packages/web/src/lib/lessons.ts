import { boardOf, cellOf, formatMove, play, type Position } from '@uttt/core';

/**
 * One step of "Learn to play": a position and a one-move task that teaches a rule by doing it. Its words
 * are the messages `lesson.<id>.title`, `.text`, `.task` and `.done` (see locales/en.ts).
 */
export interface Lesson {
  id: 'boards' | 'send' | 'win' | 'free' | 'mind' | 'game';
  /** The starting position, in UTN. */
  position: string;
  /** Whether your move does the task: true, or a hint (a message and its placeholders) for another try. */
  check: (position: Position, move: number) => true | Hint;
  /** A move that does the task, for the tests. */
  example: string;
}

export interface Hint {
  key: string;
  params?: Record<string, string | number>;
}

const EMPTY = '.........';

export const LESSONS: Lesson[] = [
  {
    id: 'boards',
    position: `${Array(9).fill(EMPTY).join('/')} x -`,
    check: () => true,
    example: '5-5',
  },
  {
    id: 'send',
    position: `${Array(9).fill(EMPTY).join('/')} x -`,
    check: (_, move) =>
      cellOf(move) === 6 || { key: 'lesson.send.hint', params: { board: cellOf(move) } },
    example: '5-7',
  },
  {
    id: 'win',
    position: `....o..../${EMPTY}/xx......./${EMPTY}/..o....../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x 3`,
    check: (position, move) => play(position, move).boards[2] === 'x' || { key: 'lesson.win.hint' },
    example: '3-3',
  },
  {
    id: 'free',
    position: `xxx....../o...o..../${EMPTY}/o.......o/x.x....../o......../${EMPTY}/${EMPTY}/${EMPTY} x -`,
    check: (position, move) =>
      play(position, move).boards[4] === 'x' || { key: 'lesson.free.hint' },
    example: '5-2',
  },
  {
    id: 'mind',
    position: `oo......./x......../${EMPTY}/${EMPTY}/....x..../${EMPTY}/....o..../${EMPTY}/x........ x 5`,
    check: (_, move) => cellOf(move) !== 0 || { key: 'lesson.mind.hint' },
    example: '5-9',
  },
  {
    id: 'game',
    position: `xxxoo..../xoo.x...x/xx......./..o....../o...o..../o......../${EMPTY}/${EMPTY}/${EMPTY} x 3`,
    check: (position, move) =>
      play(position, move).outcome === 'x' || {
        key: 'lesson.game.hint',
        params: { move: formatMove(move), board: boardOf(move) },
      },
    example: '3-3',
  },
];
