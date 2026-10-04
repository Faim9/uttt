import { isLegal, legalMoves, parseMove, parsePosition } from '@uttt/core';
import { expect, test } from 'vitest';
import { LESSONS } from './lessons.ts';

test.each(LESSONS)('lesson "$title" starts from a valid position and can be done', (lesson) => {
  const position = parsePosition(lesson.position);
  const example = parseMove(lesson.example);
  expect(isLegal(position, example)).toBe(true);
  expect(lesson.check(position, example)).toBe(true);
  // Every legal move is either right or gets a hint.
  for (const move of legalMoves(position)) {
    expect(['boolean', 'string']).toContain(typeof lesson.check(position, move));
  }
});

test('lessons with one answer reject the others', () => {
  const winBoard = LESSONS.find((lesson) => lesson.title === 'Win a small board');
  const position = parsePosition(winBoard?.position ?? '');
  const right = legalMoves(position).filter((move) => winBoard?.check(position, move) === true);
  expect(right).toEqual([parseMove('3-3')]);
});
