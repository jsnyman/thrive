import { MantineProvider } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createDefaultEventQueue } from "./offline/event-queue-provider";
import { createDefaultSyncStateStore } from "./offline/sync-state-provider";
import { registerServiceWorker } from "./pwa";
import "@mantine/core/styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Missing #root element");
}

const bootstrap = async (): Promise<void> => {
  const [queue, syncStateStore] = await Promise.all([
    createDefaultEventQueue(),
    createDefaultSyncStateStore(),
  ]);

  void registerServiceWorker();

  createRoot(rootElement).render(
    <MantineProvider>
      <App queue={queue} syncStateStore={syncStateStore} />
    </MantineProvider>,
  );
};

void bootstrap();
