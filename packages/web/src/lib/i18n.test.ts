import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { LESSONS } from './lessons.ts';
import de from './locales/de.ts';
import en from './locales/en.ts';
import es from './locales/es.ts';
import fr from './locales/fr.ts';
import pt from './locales/pt.ts';

const LANGUAGES = { de, es, fr, pt };
type Key = keyof typeof en;
const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();

/** Every source file of a package, as one string. */
function source(dir: string): string {
  const files = readdirSync(new URL(dir, import.meta.url), { recursive: true, encoding: 'utf8' });
  return files
    .filter((file) => /\.(ts|svelte)$/.test(file) && !file.includes('locales'))
    .map((file) => readFileSync(new URL(dir + file, import.meta.url), 'utf8'))
    .join('\n');
}

test.each(Object.entries(LANGUAGES))('%s has the same placeholders as English', (_, messages) => {
  for (const key of Object.keys(en) as Key[]) {
    expect(placeholders(messages[key]), key).toEqual(placeholders(en[key]));
  }
});

test("the server's messages that get translated are word for word what it sends", () => {
  const server = source('../../../server/src/') + source('../../../core/src/');
  const unknown = Object.entries(en).filter(
    ([key, text]) =>
      key.startsWith('error.') &&
      !server.includes(text) &&
      // Messages the web app makes itself.
      key !== 'error.somethingWrong',
  );
  expect(unknown).toEqual([]);
});

test('every count has its singular and plural, and every lesson hint exists', () => {
  const web = source('../');
  const counted = [...web.matchAll(/\btn\(\s*'([\w.]+)'/g)].map(([, key]) => key);
  expect(counted.length).toBeGreaterThan(0);
  for (const key of counted) {
    expect(en, key).toHaveProperty([`${key}.one`]);
    expect(en, key).toHaveProperty([`${key}.other`]);
  }
  for (const lesson of LESSONS) {
    expect(en).toHaveProperty([`lesson.${lesson.id}.title`]);
  }
  for (const key of web.matchAll(/key: '(lesson\.[\w.]+)'/g)) {
    expect(en).toHaveProperty([key[1]]);
  }
});
