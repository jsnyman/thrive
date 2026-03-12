import { createApiClient } from "./api-client";

export type MaterialsCollectedReportFilter = {
  fromDate?: string | null;
  toDate?: string | null;
  locationText?: string | null;
  materialTypeId?: string | null;
};

export type PointsLiabilityReportFilter = {
  search?: string | null;
};

export type SalesReportFilter = {
  fromDate?: string | null;
  toDate?: string | null;
  locationText?: string | null;
  itemId?: string | null;
};

export type CashflowReportFilter = {
  fromDate?: string | null;
  toDate?: string | null;
  locationText?: string | null;
};

export type InventoryStatusLogReportFilter = {
  fromDate?: string | null;
  toDate?: string | null;
  fromStatus?: "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing" | null;
  toStatus?: "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing" | null;
};

export type MaterialsCollectedReportRow = {
  day: string;
  materialTypeId: string;
  materialName: string;
  locationText: string;
  totalWeightKg: number;
  totalPoints: number;
};

export type MaterialsCollectedReportResponse = {
  rows: MaterialsCollectedReportRow[];
  appliedFilters: {
    fromDate: string | null;
    toDate: string | null;
    locationText: string | null;
    materialTypeId: string | null;
  };
};

export type PointsLiabilityReportRow = {
  personId: string;
  name: string;
  surname: string;
  balancePoints: number;
};

export type PointsLiabilityReportResponse = {
  rows: PointsLiabilityReportRow[];
  summary: {
    totalOutstandingPoints: number;
    personCount: number;
  };
  appliedFilters: {
    search: string | null;
  };
};

export type InventoryStatusReportSummaryRow = {
  status: "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing";
  totalQuantity: number;
  totalCostValue: number;
};

export type InventoryStatusReportRow = {
  status: "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing";
  itemId: string;
  itemName: string;
  quantity: number;
  unitCost: number;
  totalCostValue: number;
};

export type InventoryStatusReportResponse = {
  summary: InventoryStatusReportSummaryRow[];
  rows: InventoryStatusReportRow[];
};

export type InventoryStatusLogReportRow = {
  eventId: string;
  eventType: "inventory.status_changed" | "inventory.adjustment_applied";
  occurredAt: string;
  inventoryBatchId: string;
  itemId: string | null;
  itemName: string | null;
  fromStatus: "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing";
  toStatus: "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing";
  quantity: number;
  reason: string | null;
  notes: string | null;
};

export type InventoryStatusLogReportResponse = {
  rows: InventoryStatusLogReportRow[];
  appliedFilters: {
    fromDate: string | null;
    toDate: string | null;
    fromStatus: InventoryStatusLogReportFilter["fromStatus"];
    toStatus: InventoryStatusLogReportFilter["toStatus"];
  };
};

export type SalesReportRow = {
  day: string;
  itemId: string;
  itemName: string;
  locationText: string;
  totalQuantity: number;
  totalPoints: number;
  saleCount: number;
};

export type SalesReportResponse = {
  rows: SalesReportRow[];
  summary: {
    totalQuantity: number;
    totalPoints: number;
    saleCount: number;
  };
  appliedFilters: {
    fromDate: string | null;
    toDate: string | null;
    locationText: string | null;
    itemId: string | null;
  };
};

export type CashflowReportRow = {
  day: string;
  salesPointsValue: number;
  expenseCashTotal: number;
  netCashflow: number;
  saleCount: number;
  expenseCount: number;
};

export type CashflowExpenseCategoryRow = {
  category: string;
  totalCashAmount: number;
  expenseCount: number;
};

export type CashflowReportResponse = {
  rows: CashflowReportRow[];
  summary: {
    totalSalesPointsValue: number;
    totalExpenseCash: number;
    netCashflow: number;
    saleCount: number;
    expenseCount: number;
  };
  expenseCategories: CashflowExpenseCategoryRow[];
  appliedFilters: {
    fromDate: string | null;
    toDate: string | null;
    locationText: string | null;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseReportRow = (value: unknown): MaterialsCollectedReportRow => {
  if (!isRecord(value)) {
    throw new Error("Invalid materials report row");
  }
  if (
    typeof value["day"] !== "string" ||
    typeof value["materialTypeId"] !== "string" ||
    typeof value["materialName"] !== "string" ||
    typeof value["locationText"] !== "string" ||
    typeof value["totalWeightKg"] !== "number" ||
    typeof value["totalPoints"] !== "number"
  ) {
    throw new Error("Invalid materials report row");
  }
  return {
    day: value["day"],
    materialTypeId: value["materialTypeId"],
    materialName: value["materialName"],
    locationText: value["locationText"],
    totalWeightKg: value["totalWeightKg"],
    totalPoints: value["totalPoints"],
  };
};

const parsePointsLiabilityReportRow = (value: unknown): PointsLiabilityReportRow => {
  if (!isRecord(value)) {
    throw new Error("Invalid points liability report row");
  }
  if (
    typeof value["personId"] !== "string" ||
    typeof value["name"] !== "string" ||
    typeof value["surname"] !== "string" ||
    typeof value["balancePoints"] !== "number"
  ) {
    throw new Error("Invalid points liability report row");
  }
  return {
    personId: value["personId"],
    name: value["name"],
    surname: value["surname"],
    balancePoints: value["balancePoints"],
  };
};

const isInventoryStatusValue = (
  value: unknown,
): value is InventoryStatusReportSummaryRow["status"] =>
  value === "storage" ||
  value === "shop" ||
  value === "sold" ||
  value === "spoiled" ||
  value === "damaged" ||
  value === "missing";

const parseInventoryStatusReportSummaryRow = (value: unknown): InventoryStatusReportSummaryRow => {
  if (!isRecord(value)) {
    throw new Error("Invalid inventory status report summary row");
  }
  if (
    !isInventoryStatusValue(value["status"]) ||
    typeof value["totalQuantity"] !== "number" ||
    !Number.isInteger(value["totalQuantity"]) ||
    typeof value["totalCostValue"] !== "number"
  ) {
    throw new Error("Invalid inventory status report summary row");
  }
  return {
    status: value["status"],
    totalQuantity: value["totalQuantity"],
    totalCostValue: value["totalCostValue"],
  };
};

const parseInventoryStatusReportRow = (value: unknown): InventoryStatusReportRow => {
  if (!isRecord(value)) {
    throw new Error("Invalid inventory status report row");
  }
  if (
    !isInventoryStatusValue(value["status"]) ||
    typeof value["itemId"] !== "string" ||
    typeof value["itemName"] !== "string" ||
    typeof value["quantity"] !== "number" ||
    !Number.isInteger(value["quantity"]) ||
    typeof value["unitCost"] !== "number" ||
    typeof value["totalCostValue"] !== "number"
  ) {
    throw new Error("Invalid inventory status report row");
  }
  return {
    status: value["status"],
    itemId: value["itemId"],
    itemName: value["itemName"],
    quantity: value["quantity"],
    unitCost: value["unitCost"],
    totalCostValue: value["totalCostValue"],
  };
};

const parseInventoryStatusLogReportRow = (value: unknown): InventoryStatusLogReportRow => {
  if (!isRecord(value)) {
    throw new Error("Invalid inventory status log report row");
  }
  if (
    typeof value["eventId"] !== "string" ||
    (value["eventType"] !== "inventory.status_changed" &&
      value["eventType"] !== "inventory.adjustment_applied") ||
    typeof value["occurredAt"] !== "string" ||
    typeof value["inventoryBatchId"] !== "string" ||
    (value["itemId"] !== null &&
      value["itemId"] !== undefined &&
      typeof value["itemId"] !== "string") ||
    (value["itemName"] !== null &&
      value["itemName"] !== undefined &&
      typeof value["itemName"] !== "string") ||
    !isInventoryStatusValue(value["fromStatus"]) ||
    !isInventoryStatusValue(value["toStatus"]) ||
    typeof value["quantity"] !== "number" ||
    !Number.isInteger(value["quantity"]) ||
    (value["reason"] !== null &&
      value["reason"] !== undefined &&
      typeof value["reason"] !== "string") ||
    (value["notes"] !== null && value["notes"] !== undefined && typeof value["notes"] !== "string")
  ) {
    throw new Error("Invalid inventory status log report row");
  }
  return {
    eventId: value["eventId"],
    eventType: value["eventType"],
    occurredAt: value["occurredAt"],
    inventoryBatchId: value["inventoryBatchId"],
    itemId: (value["itemId"] as string | null | undefined) ?? null,
    itemName: (value["itemName"] as string | null | undefined) ?? null,
    fromStatus: value["fromStatus"],
    toStatus: value["toStatus"],
    quantity: value["quantity"],
    reason: (value["reason"] as string | null | undefined) ?? null,
    notes: (value["notes"] as string | null | undefined) ?? null,
  };
};

const parseSalesReportRow = (value: unknown): SalesReportRow => {
  if (!isRecord(value)) {
    throw new Error("Invalid sales report row");
  }
  if (
    typeof value["day"] !== "string" ||
    typeof value["itemId"] !== "string" ||
    typeof value["itemName"] !== "string" ||
    typeof value["locationText"] !== "string" ||
    typeof value["totalQuantity"] !== "number" ||
    !Number.isInteger(value["totalQuantity"]) ||
    typeof value["totalPoints"] !== "number" ||
    typeof value["saleCount"] !== "number" ||
    !Number.isInteger(value["saleCount"])
  ) {
    throw new Error("Invalid sales report row");
  }
  return {
    day: value["day"],
    itemId: value["itemId"],
    itemName: value["itemName"],
    locationText: value["locationText"],
    totalQuantity: value["totalQuantity"],
    totalPoints: value["totalPoints"],
    saleCount: value["saleCount"],
  };
};

const parseCashflowReportRow = (value: unknown): CashflowReportRow => {
  if (!isRecord(value)) {
    throw new Error("Invalid cashflow report row");
  }
  if (
    typeof value["day"] !== "string" ||
    typeof value["salesPointsValue"] !== "number" ||
    typeof value["expenseCashTotal"] !== "number" ||
    typeof value["netCashflow"] !== "number" ||
    typeof value["saleCount"] !== "number" ||
    !Number.isInteger(value["saleCount"]) ||
    typeof value["expenseCount"] !== "number" ||
    !Number.isInteger(value["expenseCount"])
  ) {
    throw new Error("Invalid cashflow report row");
  }
  return {
    day: value["day"],
    salesPointsValue: value["salesPointsValue"],
    expenseCashTotal: value["expenseCashTotal"],
    netCashflow: value["netCashflow"],
    saleCount: value["saleCount"],
    expenseCount: value["expenseCount"],
  };
};

const parseCashflowExpenseCategoryRow = (value: unknown): CashflowExpenseCategoryRow => {
  if (!isRecord(value)) {
    throw new Error("Invalid cashflow expense category row");
  }
  if (
    typeof value["category"] !== "string" ||
    typeof value["totalCashAmount"] !== "number" ||
    typeof value["expenseCount"] !== "number" ||
    !Number.isInteger(value["expenseCount"])
  ) {
    throw new Error("Invalid cashflow expense category row");
  }
  return {
    category: value["category"],
    totalCashAmount: value["totalCashAmount"],
    expenseCount: value["expenseCount"],
  };
};

const toQueryParams = (filters?: MaterialsCollectedReportFilter): string => {
  const params = new URLSearchParams();
  if (
    filters?.fromDate !== undefined &&
    filters.fromDate !== null &&
    filters.fromDate.trim().length > 0
  ) {
    params.set("fromDate", filters.fromDate.trim());
  }
  if (
    filters?.toDate !== undefined &&
    filters.toDate !== null &&
    filters.toDate.trim().length > 0
  ) {
    params.set("toDate", filters.toDate.trim());
  }
  if (
    filters?.locationText !== undefined &&
    filters.locationText !== null &&
    filters.locationText.trim().length > 0
  ) {
    params.set("locationText", filters.locationText.trim());
  }
  if (
    filters?.materialTypeId !== undefined &&
    filters.materialTypeId !== null &&
    filters.materialTypeId.trim().length > 0
  ) {
    params.set("materialTypeId", filters.materialTypeId.trim());
  }
  const query = params.toString();
  if (query.length === 0) {
    return "";
  }
  return `?${query}`;
};

const toPointsLiabilityQueryParams = (filters?: PointsLiabilityReportFilter): string => {
  const params = new URLSearchParams();
  if (
    filters?.search !== undefined &&
    filters.search !== null &&
    filters.search.trim().length > 0
  ) {
    params.set("search", filters.search.trim());
  }
  const query = params.toString();
  if (query.length === 0) {
    return "";
  }
  return `?${query}`;
};

const toInventoryStatusLogQueryParams = (filters?: InventoryStatusLogReportFilter): string => {
  const params = new URLSearchParams();
  if (
    filters?.fromDate !== undefined &&
    filters.fromDate !== null &&
    filters.fromDate.trim().length > 0
  ) {
    params.set("fromDate", filters.fromDate.trim());
  }
  if (
    filters?.toDate !== undefined &&
    filters.toDate !== null &&
    filters.toDate.trim().length > 0
  ) {
    params.set("toDate", filters.toDate.trim());
  }
  if (filters?.fromStatus !== undefined && filters.fromStatus !== null) {
    params.set("fromStatus", filters.fromStatus);
  }
  if (filters?.toStatus !== undefined && filters.toStatus !== null) {
    params.set("toStatus", filters.toStatus);
  }
  const query = params.toString();
  if (query.length === 0) {
    return "";
  }
  return `?${query}`;
};

const toSalesReportQueryParams = (filters?: SalesReportFilter): string => {
  const params = new URLSearchParams();
  if (
    filters?.fromDate !== undefined &&
    filters.fromDate !== null &&
    filters.fromDate.trim().length > 0
  ) {
    params.set("fromDate", filters.fromDate.trim());
  }
  if (
    filters?.toDate !== undefined &&
    filters.toDate !== null &&
    filters.toDate.trim().length > 0
  ) {
    params.set("toDate", filters.toDate.trim());
  }
  if (
    filters?.locationText !== undefined &&
    filters.locationText !== null &&
    filters.locationText.trim().length > 0
  ) {
    params.set("locationText", filters.locationText.trim());
  }
  if (
    filters?.itemId !== undefined &&
    filters.itemId !== null &&
    filters.itemId.trim().length > 0
  ) {
    params.set("itemId", filters.itemId.trim());
  }
  const query = params.toString();
  if (query.length === 0) {
    return "";
  }
  return `?${query}`;
};

const toCashflowReportQueryParams = (filters?: CashflowReportFilter): string => {
  const params = new URLSearchParams();
  if (
    filters?.fromDate !== undefined &&
    filters.fromDate !== null &&
    filters.fromDate.trim().length > 0
  ) {
    params.set("fromDate", filters.fromDate.trim());
  }
  if (
    filters?.toDate !== undefined &&
    filters.toDate !== null &&
    filters.toDate.trim().length > 0
  ) {
    params.set("toDate", filters.toDate.trim());
  }
  if (
    filters?.locationText !== undefined &&
    filters.locationText !== null &&
    filters.locationText.trim().length > 0
  ) {
    params.set("locationText", filters.locationText.trim());
  }
  const query = params.toString();
  if (query.length === 0) {
    return "";
  }
  return `?${query}`;
};

export const createReportsClient = (options?: { fetchFn?: typeof fetch; baseUrl?: string }) => {
  const apiClient = createApiClient({
    ...(options?.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    ...(options?.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
  });

  const getMaterialsCollectedReport = async (
    filters?: MaterialsCollectedReportFilter,
  ): Promise<MaterialsCollectedReportResponse> => {
    const response = await apiClient.request({
      method: "GET",
      path: `/reports/materials-collected${toQueryParams(filters)}`,
    });
    if (!response.ok) {
      throw new Error(`Materials report fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "materials report");
    if (!isRecord(body) || !Array.isArray(body["rows"]) || !isRecord(body["appliedFilters"])) {
      throw new Error("Invalid materials report response");
    }
    const appliedFilters = body["appliedFilters"];
    if (
      appliedFilters["fromDate"] !== null &&
      appliedFilters["fromDate"] !== undefined &&
      typeof appliedFilters["fromDate"] !== "string"
    ) {
      throw new Error("Invalid materials report response");
    }
    if (
      appliedFilters["toDate"] !== null &&
      appliedFilters["toDate"] !== undefined &&
      typeof appliedFilters["toDate"] !== "string"
    ) {
      throw new Error("Invalid materials report response");
    }
    if (
      appliedFilters["locationText"] !== null &&
      appliedFilters["locationText"] !== undefined &&
      typeof appliedFilters["locationText"] !== "string"
    ) {
      throw new Error("Invalid materials report response");
    }
    if (
      appliedFilters["materialTypeId"] !== null &&
      appliedFilters["materialTypeId"] !== undefined &&
      typeof appliedFilters["materialTypeId"] !== "string"
    ) {
      throw new Error("Invalid materials report response");
    }
    return {
      rows: body["rows"].map(parseReportRow),
      appliedFilters: {
        fromDate: (appliedFilters["fromDate"] as string | null | undefined) ?? null,
        toDate: (appliedFilters["toDate"] as string | null | undefined) ?? null,
        locationText: (appliedFilters["locationText"] as string | null | undefined) ?? null,
        materialTypeId: (appliedFilters["materialTypeId"] as string | null | undefined) ?? null,
      },
    };
  };

  const getPointsLiabilityReport = async (
    filters?: PointsLiabilityReportFilter,
  ): Promise<PointsLiabilityReportResponse> => {
    const response = await apiClient.request({
      method: "GET",
      path: `/reports/points-liability${toPointsLiabilityQueryParams(filters)}`,
    });
    if (!response.ok) {
      throw new Error(
        `Points liability report fetch failed with status ${String(response.status)}`,
      );
    }
    const body = await apiClient.readJson<unknown>(response, "points liability report");
    if (
      !isRecord(body) ||
      !Array.isArray(body["rows"]) ||
      !isRecord(body["summary"]) ||
      !isRecord(body["appliedFilters"])
    ) {
      throw new Error("Invalid points liability report response");
    }
    const summary = body["summary"];
    const appliedFilters = body["appliedFilters"];
    if (
      typeof summary["totalOutstandingPoints"] !== "number" ||
      typeof summary["personCount"] !== "number" ||
      !Number.isInteger(summary["personCount"])
    ) {
      throw new Error("Invalid points liability report response");
    }
    if (
      appliedFilters["search"] !== null &&
      appliedFilters["search"] !== undefined &&
      typeof appliedFilters["search"] !== "string"
    ) {
      throw new Error("Invalid points liability report response");
    }
    return {
      rows: body["rows"].map(parsePointsLiabilityReportRow),
      summary: {
        totalOutstandingPoints: summary["totalOutstandingPoints"],
        personCount: summary["personCount"],
      },
      appliedFilters: {
        search: (appliedFilters["search"] as string | null | undefined) ?? null,
      },
    };
  };

  const getInventoryStatusReport = async (): Promise<InventoryStatusReportResponse> => {
    const response = await apiClient.request({
      method: "GET",
      path: "/reports/inventory-status",
    });
    if (!response.ok) {
      throw new Error(
        `Inventory status report fetch failed with status ${String(response.status)}`,
      );
    }
    const body = await apiClient.readJson<unknown>(response, "inventory status report");
    if (!isRecord(body) || !Array.isArray(body["summary"]) || !Array.isArray(body["rows"])) {
      throw new Error("Invalid inventory status report response");
    }
    return {
      summary: body["summary"].map(parseInventoryStatusReportSummaryRow),
      rows: body["rows"].map(parseInventoryStatusReportRow),
    };
  };

  const getInventoryStatusLogReport = async (
    filters?: InventoryStatusLogReportFilter,
  ): Promise<InventoryStatusLogReportResponse> => {
    const response = await apiClient.request({
      method: "GET",
      path: `/reports/inventory-status-log${toInventoryStatusLogQueryParams(filters)}`,
    });
    if (!response.ok) {
      throw new Error(
        `Inventory status log report fetch failed with status ${String(response.status)}`,
      );
    }
    const body = await apiClient.readJson<unknown>(response, "inventory status log report");
    if (!isRecord(body) || !Array.isArray(body["rows"]) || !isRecord(body["appliedFilters"])) {
      throw new Error("Invalid inventory status log report response");
    }
    const appliedFilters = body["appliedFilters"];
    if (
      (appliedFilters["fromDate"] !== null &&
        appliedFilters["fromDate"] !== undefined &&
        typeof appliedFilters["fromDate"] !== "string") ||
      (appliedFilters["toDate"] !== null &&
        appliedFilters["toDate"] !== undefined &&
        typeof appliedFilters["toDate"] !== "string") ||
      (appliedFilters["fromStatus"] !== null &&
        appliedFilters["fromStatus"] !== undefined &&
        !isInventoryStatusValue(appliedFilters["fromStatus"])) ||
      (appliedFilters["toStatus"] !== null &&
        appliedFilters["toStatus"] !== undefined &&
        !isInventoryStatusValue(appliedFilters["toStatus"]))
    ) {
      throw new Error("Invalid inventory status log report response");
    }
    return {
      rows: body["rows"].map(parseInventoryStatusLogReportRow),
      appliedFilters: {
        fromDate: (appliedFilters["fromDate"] as string | null | undefined) ?? null,
        toDate: (appliedFilters["toDate"] as string | null | undefined) ?? null,
        fromStatus:
          (appliedFilters["fromStatus"] as
            | InventoryStatusLogReportFilter["fromStatus"]
            | undefined) ?? null,
        toStatus:
          (appliedFilters["toStatus"] as InventoryStatusLogReportFilter["toStatus"] | undefined) ??
          null,
      },
    };
  };

  const getSalesReport = async (filters?: SalesReportFilter): Promise<SalesReportResponse> => {
    const response = await apiClient.request({
      method: "GET",
      path: `/reports/sales${toSalesReportQueryParams(filters)}`,
    });
    if (!response.ok) {
      throw new Error(`Sales report fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "sales report");
    if (
      !isRecord(body) ||
      !Array.isArray(body["rows"]) ||
      !isRecord(body["summary"]) ||
      !isRecord(body["appliedFilters"])
    ) {
      throw new Error("Invalid sales report response");
    }
    const summary = body["summary"];
    const appliedFilters = body["appliedFilters"];
    if (
      typeof summary["totalQuantity"] !== "number" ||
      !Number.isInteger(summary["totalQuantity"]) ||
      typeof summary["totalPoints"] !== "number" ||
      typeof summary["saleCount"] !== "number" ||
      !Number.isInteger(summary["saleCount"])
    ) {
      throw new Error("Invalid sales report response");
    }
    if (
      (appliedFilters["fromDate"] !== null &&
        appliedFilters["fromDate"] !== undefined &&
        typeof appliedFilters["fromDate"] !== "string") ||
      (appliedFilters["toDate"] !== null &&
        appliedFilters["toDate"] !== undefined &&
        typeof appliedFilters["toDate"] !== "string") ||
      (appliedFilters["locationText"] !== null &&
        appliedFilters["locationText"] !== undefined &&
        typeof appliedFilters["locationText"] !== "string") ||
      (appliedFilters["itemId"] !== null &&
        appliedFilters["itemId"] !== undefined &&
        typeof appliedFilters["itemId"] !== "string")
    ) {
      throw new Error("Invalid sales report response");
    }
    return {
      rows: body["rows"].map(parseSalesReportRow),
      summary: {
        totalQuantity: summary["totalQuantity"],
        totalPoints: summary["totalPoints"],
        saleCount: summary["saleCount"],
      },
      appliedFilters: {
        fromDate: (appliedFilters["fromDate"] as string | null | undefined) ?? null,
        toDate: (appliedFilters["toDate"] as string | null | undefined) ?? null,
        locationText: (appliedFilters["locationText"] as string | null | undefined) ?? null,
        itemId: (appliedFilters["itemId"] as string | null | undefined) ?? null,
      },
    };
  };

  const getCashflowReport = async (
    filters?: CashflowReportFilter,
  ): Promise<CashflowReportResponse> => {
    const response = await apiClient.request({
      method: "GET",
      path: `/reports/cashflow${toCashflowReportQueryParams(filters)}`,
    });
    if (!response.ok) {
      throw new Error(`Cashflow report fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "cashflow report");
    if (
      !isRecord(body) ||
      !Array.isArray(body["rows"]) ||
      !isRecord(body["summary"]) ||
      !Array.isArray(body["expenseCategories"]) ||
      !isRecord(body["appliedFilters"])
    ) {
      throw new Error("Invalid cashflow report response");
    }
    const summary = body["summary"];
    const appliedFilters = body["appliedFilters"];
    if (
      typeof summary["totalSalesPointsValue"] !== "number" ||
      typeof summary["totalExpenseCash"] !== "number" ||
      typeof summary["netCashflow"] !== "number" ||
      typeof summary["saleCount"] !== "number" ||
      !Number.isInteger(summary["saleCount"]) ||
      typeof summary["expenseCount"] !== "number" ||
      !Number.isInteger(summary["expenseCount"])
    ) {
      throw new Error("Invalid cashflow report response");
    }
    if (
      (appliedFilters["fromDate"] !== null &&
        appliedFilters["fromDate"] !== undefined &&
        typeof appliedFilters["fromDate"] !== "string") ||
      (appliedFilters["toDate"] !== null &&
        appliedFilters["toDate"] !== undefined &&
        typeof appliedFilters["toDate"] !== "string") ||
      (appliedFilters["locationText"] !== null &&
        appliedFilters["locationText"] !== undefined &&
        typeof appliedFilters["locationText"] !== "string")
    ) {
      throw new Error("Invalid cashflow report response");
    }
    return {
      rows: body["rows"].map(parseCashflowReportRow),
      summary: {
        totalSalesPointsValue: summary["totalSalesPointsValue"],
        totalExpenseCash: summary["totalExpenseCash"],
        netCashflow: summary["netCashflow"],
        saleCount: summary["saleCount"],
        expenseCount: summary["expenseCount"],
      },
      expenseCategories: body["expenseCategories"].map(parseCashflowExpenseCategoryRow),
      appliedFilters: {
        fromDate: (appliedFilters["fromDate"] as string | null | undefined) ?? null,
        toDate: (appliedFilters["toDate"] as string | null | undefined) ?? null,
        locationText: (appliedFilters["locationText"] as string | null | undefined) ?? null,
      },
    };
  };

  return {
    getMaterialsCollectedReport,
    getPointsLiabilityReport,
    getInventoryStatusReport,
    getInventoryStatusLogReport,
    getSalesReport,
    getCashflowReport,
  };
};
