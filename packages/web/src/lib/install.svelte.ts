/**
 * Installing the site as an app. Chrome and Edge (Android, desktop) offer an install prompt we can show from
 * a button; Safari on iPhone and iPad has no prompt, so it gets instructions instead.
 */

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
}

export const install = $state<{ prompt: InstallPrompt | null; ios: boolean; installed: boolean }>({
  prompt: null,
  ios: false,
  installed: false,
});

/** Call once in the browser, from the layout. */
export function watchInstall(): void {
  install.installed = matchMedia('(display-mode: standalone)').matches;
  install.ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !install.installed;
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    install.prompt = event as InstallPrompt;
  });
  addEventListener('appinstalled', () => {
    install.prompt = null;
    install.installed = true;
  });
}

export async function installApp(): Promise<void> {
  await install.prompt?.prompt();
  install.prompt = null;
}
