import { Button, Card, Container, MantineProvider, Stack, Text, Title } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createDefaultEventQueue } from "./offline/event-queue-provider";
import { createDefaultSyncStateStore } from "./offline/sync-state-provider";
import { registerServiceWorker } from "./pwa";
import "@mantine/core/styles.css";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const StartupErrorScreen = ({ message }: { message: string }): JSX.Element => {
  return (
    <MantineProvider>
      <Container size="sm" py="xl">
        <Card shadow="sm" radius="md" padding="lg">
          <Stack gap="md">
            <Title order={3}>Startup Error</Title>
            <Text>
              The app could not initialize offline storage, so it cannot start in this browser
              session.
            </Text>
            <Text c="red">{message}</Text>
            <Text size="sm" c="dimmed">
              Try Chrome or Edge in a normal window, or reload after clearing site data.
            </Text>
            <Button
              onClick={() => {
                globalThis.location.reload();
              }}
            >
              Reload
            </Button>
          </Stack>
        </Card>
      </Container>
    </MantineProvider>
  );
};

export const bootstrapApp = async (rootElement: HTMLElement): Promise<void> => {
  const root = createRoot(rootElement);

  try {
    // Serialize OPFS-backed store initialization so both stores do not race on first DB open.
    const queue = await createDefaultEventQueue();
    const syncStateStore = await createDefaultSyncStateStore();

    void registerServiceWorker();

    root.render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );
  } catch (error) {
    root.render(<StartupErrorScreen message={getErrorMessage(error)} />);
  }
};
