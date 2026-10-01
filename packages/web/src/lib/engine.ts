import type { Analysis, Position } from '@uttt/core';

/** A new request supersedes the previous one; `position: null` just stops. */
export interface EngineRequest {
  id: number;
  position: Position | null;
  playouts: number;
}

export interface EngineUpdate {
  id: number;
  analysis: Analysis;
  done: boolean;
}

/** Runs the MCTS engine in a Web Worker so the page stays responsive while it thinks. */
export class Engine {
  private readonly worker = new Worker(new URL('./engine.worker.ts', import.meta.url), {
    type: 'module',
  });
  private id = 0;
  private active: {
    onUpdate: (analysis: Analysis) => void;
    resolve: (analysis: Analysis | null) => void;
  } | null = null;

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<EngineUpdate>) => {
      if (data.id !== this.id) return;
      this.active?.onUpdate(data.analysis);
      if (data.done) this.settle(data.analysis);
    };
  }

  /**
   * Searches `position` for up to `playouts`, reporting progress along the way.
   * Resolves with the final analysis, or null if stopped or superseded first.
   */
  analyze(
    position: Position,
    playouts: number,
    onUpdate: (analysis: Analysis) => void = () => {},
  ): Promise<Analysis | null> {
    return new Promise((resolve) => {
      this.send(position, playouts);
      this.active = { onUpdate, resolve };
    });
  }

  stop(): void {
    this.send(null, 0);
  }

  destroy(): void {
    this.stop();
    this.worker.terminate();
  }

  private send(position: Position | null, playouts: number): void {
    this.settle(null);
    this.worker.postMessage({ id: ++this.id, position, playouts } satisfies EngineRequest);
  }

  private settle(analysis: Analysis | null): void {
    this.active?.resolve(analysis);
    this.active = null;
  }
}
