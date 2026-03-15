import { describe, expect, test, vi } from "vitest";
import { registerServiceWorker } from "./pwa";
import indexHtml from "../index.html?raw";
import manifestText from "../public/manifest.webmanifest?raw";

describe("registerServiceWorker", () => {
  test("registers the service worker when supported", async () => {
    const register = vi
      .fn<(scriptURL: string, options?: RegistrationOptions) => Promise<unknown>>()
      .mockResolvedValue({ scope: "/" });

    const registration = await registerServiceWorker({
      register,
    } as unknown as ServiceWorkerContainer);

    expect(register).toHaveBeenCalledWith("/service-worker.js");
    expect(registration).toEqual({ scope: "/" });
  });

  test("returns null when service workers are unavailable", async () => {
    await expect(registerServiceWorker(undefined)).resolves.toBeNull();
  });

  test("returns null when registration fails", async () => {
    const register = vi
      .fn<(scriptURL: string, options?: RegistrationOptions) => Promise<unknown>>()
      .mockRejectedValue(new Error("offline"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      registerServiceWorker({
        register,
      } as unknown as ServiceWorkerContainer),
    ).resolves.toBeNull();

    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("PWA install assets", () => {
  test("index.html links install metadata", () => {
    expect(indexHtml).toContain('rel="manifest"');
    expect(indexHtml).toContain('name="theme-color"');
    expect(indexHtml).toContain('name="apple-mobile-web-app-capable"');
    expect(indexHtml).toContain('rel="apple-touch-icon"');
  });

  test("manifest enables standalone install with icons", () => {
    const manifest = JSON.parse(manifestText) as {
      display?: string;
      name?: string;
      short_name?: string;
      icons?: Array<{ src?: string; sizes?: string }>;
    };

    expect(manifest.name).toBe("Recycling Swap-Shop");
    expect(manifest.short_name).toBe("Swap-Shop");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192" }),
        expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512" }),
      ]),
    );
  });
});
