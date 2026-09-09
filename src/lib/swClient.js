export const VFS_PREFIX = '/__vfs/';

export function vfsUrl(projectId, path) {
  const parts = String(path)
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return VFS_PREFIX + encodeURIComponent(projectId) + '/' + parts;
}

/**
 * Register the virtual-filesystem worker and wait until it actually controls
 * this page. Without a controller the preview iframe would hit the network
 * instead of IndexedDB, so the app blocks on this during boot.
 */
export async function initServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error(
      'This browser has no service worker support, which Demo Vault needs to render saved demos. Private windows in some browsers disable it.'
    );
  }

  await navigator.serviceWorker.register(
    import.meta.env.BASE_URL.replace(/\/$/, '') + '/sw.js',
    { scope: '/' }
  );
  await navigator.serviceWorker.ready;

  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => {
      const done = () => {
        navigator.serviceWorker.removeEventListener('controllerchange', done);
        resolve();
      };
      navigator.serviceWorker.addEventListener('controllerchange', done);
      setTimeout(done, 4000);
    });
  }

  if (!navigator.serviceWorker.controller) {
    throw new Error(
      'The preview worker registered but is not controlling this page yet. Reloading usually fixes it.'
    );
  }
}
