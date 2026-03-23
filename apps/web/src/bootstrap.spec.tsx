import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mockedEventQueueProvider = vi.hoisted(() => {
  return {
    createDefaultEventQueue: vi.fn(),
  };
});

const mockedSyncStateProvider = vi.hoisted(() => {
  return {
    createDefaultSyncStateStore: vi.fn(),
  };
});

const mockedPwaModule = vi.hoisted(() => {
  return {
    registerServiceWorker: vi.fn(),
  };
});

const mockedRender = vi.hoisted(() => vi.fn());
const mockedCreateRoot = vi.hoisted(() =>
  vi.fn(() => {
    return {
      render: mockedRender,
    };
  }),
);

vi.mock("./offline/event-queue-provider", () => mockedEventQueueProvider);
vi.mock("./offline/sync-state-provider", () => mockedSyncStateProvider);
vi.mock("./pwa", () => mockedPwaModule);
vi.mock("react-dom/client", () => {
  return {
    createRoot: mockedCreateRoot,
  };
});
vi.mock("./App", () => {
  return {
    App: () => {
      return <div>app</div>;
    },
  };
});

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("bootstrapApp", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    mockedCreateRoot.mockClear();
    mockedRender.mockClear();
    mockedPwaModule.registerServiceWorker.mockReset();
    mockedEventQueueProvider.createDefaultEventQueue.mockReset();
    mockedSyncStateProvider.createDefaultSyncStateStore.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  test("initializes offline stores sequentially before rendering the app", async () => {
    let resolveQueue!: (value: { pendingCount: () => Promise<number> }) => void;
    const queuePromise = new Promise<{ pendingCount: () => Promise<number> }>((resolve) => {
      resolveQueue = resolve;
    });

    mockedEventQueueProvider.createDefaultEventQueue.mockReturnValue(queuePromise);
    mockedSyncStateProvider.createDefaultSyncStateStore.mockResolvedValue({
      getCursor: vi.fn(),
      setCursor: vi.fn(),
      getLastSyncAt: vi.fn(),
      setLastSyncAt: vi.fn(),
    });

    const { bootstrapApp } = await import("./bootstrap");
    const rootElement = document.getElementById("root");
    if (rootElement === null) {
      throw new Error("Expected root element");
    }

    void bootstrapApp(rootElement);
    await flushPromises();

    expect(mockedEventQueueProvider.createDefaultEventQueue).toHaveBeenCalledTimes(1);
    expect(mockedSyncStateProvider.createDefaultSyncStateStore).not.toHaveBeenCalled();

    resolveQueue({
      pendingCount: async () => 0,
    });
    await flushPromises();

    expect(mockedSyncStateProvider.createDefaultSyncStateStore).toHaveBeenCalledTimes(1);
    expect(mockedPwaModule.registerServiceWorker).toHaveBeenCalledTimes(1);
    expect(mockedRender).toHaveBeenCalled();
  });

  test("renders a startup error when offline initialization fails", async () => {
    mockedEventQueueProvider.createDefaultEventQueue.mockRejectedValue(new Error("OPFS failed"));

    const { bootstrapApp } = await import("./bootstrap");
    const rootElement = document.getElementById("root");
    if (rootElement === null) {
      throw new Error("Expected root element");
    }

    await bootstrapApp(rootElement);

    expect(mockedSyncStateProvider.createDefaultSyncStateStore).not.toHaveBeenCalled();
    expect(mockedPwaModule.registerServiceWorker).not.toHaveBeenCalled();
    expect(mockedRender).toHaveBeenCalled();
  });
});
