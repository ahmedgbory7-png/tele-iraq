
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export async function showSystemNotification(title: string, options?: NotificationOptions) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  // Only show if the page is hidden or backgrounded
  if (document.visibilityState === 'hidden' || !document.hasFocus()) {
    try {
      const sw = await navigator.serviceWorker.ready;
      if (sw && sw.showNotification) {
        await sw.showNotification(title, {
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          ...options
        });
      } else {
        const notification = new Notification(title, {
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          ...options
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    } catch (err) {
      // Fallback for browsers that don't support registration.showNotification correctly
      try {
        const notification = new Notification(title, {
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          ...options
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch (innerErr) {
        console.error('Total failure showing notification:', innerErr);
      }
    }
  }
}
