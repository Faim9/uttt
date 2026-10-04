import { boardOf, cellOf, formatMove, play, type Position } from '@uttt/core';

/** One step of "Learn to play": a position and a one-move task that teaches a rule by doing it. */
export interface Lesson {
  title: string;
  /** The rule, explained before the task. */
  text: string;
  task: string;
  /** The starting position, in UTN. */
  position: string;
  /** Whether your move does the task: true, or a hint for another try. */
  check: (position: Position, move: number) => true | string;
  /** Shown once the task is done. */
  done: string;
  /** A move that does the task, for the tests. */
  example: string;
}

const EMPTY = '.........';
const BOARDS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom'];
const boardName = (board: number) => `the ${[...BOARDS, 'bottom-right'][board]} board`;

export const LESSONS: Lesson[] = [
  {
    title: 'Nine boards in one',
    text: 'Ultimate Tic-Tac-Toe is nine small tic-tac-toe boards inside a big one. Three in a row wins a small board; three small boards in a row win the game.',
    task: 'X moves first and may play anywhere. Make your first move.',
    position: `${Array(9).fill(EMPTY).join('/')} x -`,
    check: () => true,
    done: 'See the highlighted board? That is where O has to answer. The next lesson shows why.',
    example: '5-5',
  },
  {
    title: 'Your move picks their board',
    text: 'The cell you play inside a small board decides which small board your opponent plays in next. Play in a top-right cell, and your opponent must play in the top-right board.',
    task: 'Send O to the bottom-left board.',
    position: `${Array(9).fill(EMPTY).join('/')} x -`,
    check: (_, move) =>
      cellOf(move) === 6 ||
      `That sends O to ${boardName(cellOf(move))}. Pick a bottom-left cell, in any board.`,
    done: 'O must now play in the bottom-left board. Every move sends your opponent somewhere.',
    example: '5-7',
  },
  {
    title: 'Win a small board',
    text: 'You have to play in the board you were sent to: it is highlighted. Three in a row there wins it.',
    task: 'O sent you to the top-right board. Win it.',
    position: `....o..../${EMPTY}/xx......./${EMPTY}/..o....../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x 3`,
    check: (position, move) =>
      play(position, move).boards[2] === 'x' || 'Find the cell that completes three in a row.',
    done: 'The board is yours. Nobody can play in a won board any more.',
    example: '3-3',
  },
  {
    title: 'Sent to a closed board? Go anywhere',
    text: 'If you are sent to a board that is already won (or full), you may play in any open board instead. Here O just sent you to the top-left board, which you already won.',
    task: 'You are free to play anywhere. Win the center board.',
    position: `xxx....../o...o..../${EMPTY}/o.......o/x.x....../o......../${EMPTY}/${EMPTY}/${EMPTY} x -`,
    check: (position, move) =>
      play(position, move).boards[4] === 'x' ||
      'Any open board is allowed. Look at the center board: where does X make three in a row?',
    done: 'That freedom is powerful, so try not to hand it to your opponent!',
    example: '5-2',
  },
  {
    title: 'Mind where you send them',
    text: 'O has two in a row in the top-left board. If you send O there, O wins it.',
    task: 'Play in the center board without sending O to the top-left board.',
    position: `oo......./x......../${EMPTY}/${EMPTY}/....x..../${EMPTY}/....o..../${EMPTY}/x........ x 5`,
    check: (_, move) =>
      cellOf(move) !== 0 ||
      `A top-left cell sends O to the top-left board, where O completes three in a row. Try another cell.`,
    done: 'Each move is two decisions: where you play, and where your opponent must play next.',
    example: '5-9',
  },
  {
    title: 'Win the game',
    text: 'You have won the top-left and top boards. One more in that row wins the game.',
    task: 'You are in the top-right board. Win the game.',
    position: `xxxoo..../xoo.x...x/xx......./..o....../o...o..../o......../${EMPTY}/${EMPTY}/${EMPTY} x 3`,
    check: (position, move) =>
      play(position, move).outcome === 'x' ||
      `That plays ${formatMove(move)} in ${boardName(boardOf(move))}. Win the top-right board to complete the row.`,
    done: 'Three boards in a row: you win! A full board nobody won counts for no one, and if neither side can make a row, it is a draw.',
    example: '3-3',
  },
];
