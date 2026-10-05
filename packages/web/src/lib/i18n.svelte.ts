/**
 * Translations. English (locales/en.ts) is the reference; every other language must have every message
 * (TypeScript checks it) and is loaded only when picked. Messages may hold `{name}` placeholders.
 */

import en from './locales/en.ts';

export const LANGUAGES = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
} as const;
export type Language = keyof typeof LANGUAGES;
export type Key = keyof typeof en;
export type Messages = Record<Key, string>;

const KEY = 'language';
const catalogs: Record<Exclude<Language, 'en'>, () => Promise<{ default: Messages }>> = {
  de: () => import('./locales/de.ts'),
  es: () => import('./locales/es.ts'),
  fr: () => import('./locales/fr.ts'),
  pt: () => import('./locales/pt.ts'),
};

export const i18n = $state({ language: 'en' as Language });
let messages = $state.raw<Messages>(en);
let plurals = new Intl.PluralRules('en');

/** The message in the current language, with `{name}` placeholders filled in. */
export function t(key: Key, params: Record<string, string | number> = {}): string {
  return messages[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** A count with the right plural, from a pair of messages `<key>.one` and `<key>.other`. */
export function tn(key: string, n: number, params: Record<string, string | number> = {}): string {
  const form = `${key}.${plurals.select(n) === 'one' ? 'one' : 'other'}` as Key;
  return t(form, { n, ...params });
}

/** A message split around one placeholder, for putting a link (or other markup) in its place. */
export function around(
  key: Key,
  name: string,
  params: Record<string, string | number> = {},
): [string, string] {
  const [before, after = ''] = t(key, params).split(`{${name}}`);
  return [before, after];
}

/**
 * The server's messages are in English; the common ones are `error.*` messages with the very same English
 * text (a test checks they match the server's), so they can be shown in the visitor's language.
 */
const serverKeys = new Map(
  Object.entries(en).flatMap(([key, text]) =>
    key.startsWith('error.') ? [[text, key as Key]] : [],
  ),
);

export function serverText(english: string): string {
  const key = serverKeys.get(english);
  return key ? t(key) : english;
}

export async function setLanguage(language: Language): Promise<void> {
  messages = language === 'en' ? en : (await catalogs[language]()).default;
  plurals = new Intl.PluralRules(language);
  i18n.language = language;
  document.documentElement.lang = language;
  try {
    localStorage.setItem(KEY, language);
  } catch {
    // The choice lasts until the page is closed.
  }
}

/** Call once in the browser, from the layout: the saved choice, else the browser's language. */
export function loadLanguage(): Promise<void> {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // Blocked storage: fall back to the browser's languages.
  }
  const wanted = [saved, ...navigator.languages].map((tag) => tag?.slice(0, 2));
  const language = wanted.find((code): code is Language => !!code && code in LANGUAGES) ?? 'en';
  return language === 'en' ? Promise.resolve() : setLanguage(language);
}
