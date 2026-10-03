<script module lang="ts">
  interface Turnstile {
    render(
      element: HTMLElement,
      options: {
        sitekey: string;
        callback: (token: string) => void;
        'expired-callback': () => void;
      },
    ): string;
    reset(widget: string): void;
    remove(widget: string): void;
  }

  let script: Promise<Turnstile> | undefined;

  /** Loads Cloudflare's script once, only on the pages that show the check. */
  function loadTurnstile(): Promise<Turnstile> {
    script ??= new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      element.onload = () => resolve((window as unknown as { turnstile: Turnstile }).turnstile);
      element.onerror = reject;
      document.head.append(element);
    });
    return script;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './session.svelte.ts';

  /** Cloudflare Turnstile's "are you a person?" check; shows nothing when the server has it off. */
  let { ontoken }: { ontoken: (token: string) => void } = $props();

  let box: HTMLDivElement;
  let turnstile: Turnstile | undefined;
  let widget: string | undefined;

  /** Tokens work once, so a failed sign-up needs a fresh check. */
  export function reset() {
    if (turnstile && widget) turnstile.reset(widget);
  }

  onMount(() => {
    let removed = false;
    (async () => {
      const { siteKey } = await api<{ siteKey: string | null }>('GET', '/api/captcha');
      if (!siteKey) return;
      const loaded = await loadTurnstile();
      if (removed) return;
      turnstile = loaded;
      widget = loaded.render(box, {
        sitekey: siteKey,
        callback: ontoken,
        'expired-callback': () => ontoken(''),
      });
    })().catch(() => {
      // Sign-up then fails with the server's explanation, which is clearer than anything here.
    });
    return () => {
      removed = true;
      if (turnstile && widget) turnstile.remove(widget);
    };
  });
</script>

<div bind:this={box}></div>
