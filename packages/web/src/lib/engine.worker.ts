import { Search } from '@uttt/core';
import type { EngineRequest, EngineUpdate } from './engine.ts';

/** Playouts per progress update (~0.1s); between chunks the worker can receive a new request. */
const CHUNK = 2000;

let currentId = 0;

self.onmessage = ({ data }: MessageEvent<EngineRequest>) => {
  currentId = data.id;
  if (data.position) step(data.id, new Search(data.position), data.playouts);
};

function step(id: number, search: Search, playouts: number): void {
  if (id !== currentId) return;
  search.run(Math.min(CHUNK, playouts - search.analysis.playouts));
  const analysis = search.analysis;
  const done = analysis.playouts >= playouts;
  self.postMessage({ id, analysis, done } satisfies EngineUpdate);
  if (!done) setTimeout(() => step(id, search, playouts));
}
