import { isLegal, legalMoves, parseMove, parsePosition } from '@uttt/core';
import { expect, test } from 'vitest';
import { LESSONS } from './lessons.ts';

test.each(LESSONS)('lesson "$id" starts from a valid position and can be done', (lesson) => {
  const position = parsePosition(lesson.position);
  const example = parseMove(lesson.example);
  expect(isLegal(position, example)).toBe(true);
  expect(lesson.check(position, example)).toBe(true);
  // Every legal move is either right or gets a hint.
  for (const move of legalMoves(position)) {
    const result = lesson.check(position, move);
    expect(result === true || result.key.startsWith(`lesson.${lesson.id}.`)).toBe(true);
  }
});

test('lessons with one answer reject the others', () => {
  const winBoard = LESSONS.find((lesson) => lesson.id === 'win');
  const position = parsePosition(winBoard?.position ?? '');
  const right = legalMoves(position).filter((move) => winBoard?.check(position, move) === true);
  expect(right).toEqual([parseMove('3-3')]);
});
