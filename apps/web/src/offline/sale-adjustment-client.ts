import { createApiClient } from "./api-client";

export type SaleAdjustmentRequestInput = {
  saleEventId: string;
  personId: string;
  note: string;
};

export type SaleAdjustmentRequestResult = {
  requestEventId: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const createSaleAdjustmentRequestsClient = (options?: {
  fetchFn?: typeof fetch;
  baseUrl?: string;
}) => {
  const apiClient = createApiClient({
    ...(options?.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    ...(options?.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
  });

  const requestAdjustment = async (
    input: SaleAdjustmentRequestInput,
  ): Promise<SaleAdjustmentRequestResult> => {
    const response = await apiClient.request({
      method: "POST",
      path: "/sales/adjustment-requests",
      body: input,
    });
    if (!response.ok) {
      const body = await apiClient
        .readJson<unknown>(response, "sale adjustment request")
        .catch(() => null);
      const errorCode = isRecord(body) && typeof body["error"] === "string" ? body["error"] : null;
      if (errorCode !== null) {
        throw new Error(errorCode);
      }
      throw new Error(`Sale adjustment request failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "sale adjustment request");
    if (!isRecord(body) || typeof body["requestEventId"] !== "string") {
      throw new Error("Invalid sale adjustment request response");
    }
    return { requestEventId: body["requestEventId"] };
  };

  return { requestAdjustment };
};
