export const registerServiceWorker = async (
  serviceWorker: ServiceWorkerContainer | undefined = navigator.serviceWorker,
): Promise<ServiceWorkerRegistration | null> => {
  if (serviceWorker === undefined) {
    return null;
  }

  try {
    return await serviceWorker.register("/service-worker.js");
  } catch (error) {
    console.error("Service worker registration failed", error);
    return null;
  }
};
