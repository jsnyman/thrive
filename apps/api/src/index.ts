import { createApiServer } from "./http/server";

export * from "./auth";
export { createApiServer } from "./http/server";
export { readApiRuntimeConfig } from "./http/config";

const isDirectExecution = (): boolean => {
  if (typeof require === "undefined" || typeof module === "undefined") {
    return false;
  }
  return require.main === module;
};

export const startApiServer = async (): Promise<ReturnType<typeof createApiServer>> => {
  const [
    { getStaffUserByUsername },
    { readApiRuntimeConfig },
    { createPrismaClient },
    { createCoreRepository },
  ] = await Promise.all([
    import("./auth/staff-users.js"),
    import("./http/config.js"),
    import("./prisma.js"),
    import("./data/core-repository.js"),
  ]);
  const runtimeConfig = readApiRuntimeConfig();
  let prismaClient: ReturnType<typeof createPrismaClient> | null = null;
  const getPrismaClient = (): ReturnType<typeof createPrismaClient> => {
    if (prismaClient === null) {
      prismaClient = createPrismaClient();
    }
    return prismaClient;
  };
  const server = createApiServer({
    authConfig: runtimeConfig.authConfig,
    getStaffUserByUsername: async (username) => getStaffUserByUsername(getPrismaClient(), username),
    listPeople: async (search) => createCoreRepository(getPrismaClient()).listPeople(search),
    listMaterials: async () => createCoreRepository(getPrismaClient()).listMaterials(),
    listItems: async () => createCoreRepository(getPrismaClient()).listItems(),
    listInventoryBatches: async () =>
      createCoreRepository(getPrismaClient()).listInventoryBatches(),
    listShopBatchesForItem: async (itemId) =>
      createCoreRepository(getPrismaClient()).listShopBatchesForItem(itemId),
    listInventoryStatusSummary: async () =>
      createCoreRepository(getPrismaClient()).listInventoryStatusSummary(),
    getPersonById: async (personId) =>
      createCoreRepository(getPrismaClient()).getPersonById(personId),
    getMaterialById: async (materialId) =>
      createCoreRepository(getPrismaClient()).getMaterialById(materialId),
    getItemById: async (itemId) => createCoreRepository(getPrismaClient()).getItemById(itemId),
    getItemByName: async (name) => createCoreRepository(getPrismaClient()).getItemByName(name),
    getInventoryBatchState: async (inventoryBatchId) =>
      createCoreRepository(getPrismaClient()).getInventoryBatchState(inventoryBatchId),
    appendEventAndProject: async (event) =>
      createCoreRepository(getPrismaClient()).appendEventAndProject(event),
    appendEvents: async (events, lastKnownCursor) =>
      createCoreRepository(getPrismaClient()).appendEvents(events, lastKnownCursor),
    listSyncConflicts: async (status, limit, cursor) =>
      createCoreRepository(getPrismaClient()).listSyncConflicts(status, limit, cursor),
    resolveSyncConflict: async (conflictId, request, actor) =>
      createCoreRepository(getPrismaClient()).resolveSyncConflict(conflictId, request, actor),
    listSyncAuditReport: async (limit, cursor) =>
      createCoreRepository(getPrismaClient()).listSyncAuditReport(limit, cursor),
    getSyncAuditEvent: async (eventId) =>
      createCoreRepository(getPrismaClient()).getSyncAuditEvent(eventId),
    listSyncReconciliationReport: async (limit, cursor, code, repairableOnly) =>
      createCoreRepository(getPrismaClient()).listSyncReconciliationReport(
        limit,
        cursor,
        code,
        repairableOnly,
      ),
    repairSyncReconciliationIssue: async (issueId, notes, actor) =>
      createCoreRepository(getPrismaClient()).repairSyncReconciliationIssue(issueId, notes, actor),
    getLedgerBalance: async (personId) =>
      createCoreRepository(getPrismaClient()).getLedgerBalance(personId),
    listLedgerEntries: async (personId) =>
      createCoreRepository(getPrismaClient()).listLedgerEntries(personId),
    getLivePointsBalance: async (personId) =>
      createCoreRepository(getPrismaClient()).getLivePointsBalance(personId),
    listMaterialsCollectedReport: async (filters) =>
      createCoreRepository(getPrismaClient()).listMaterialsCollectedReport(filters),
    listCashflowReport: async (filters) =>
      createCoreRepository(getPrismaClient()).listCashflowReport(filters),
    listSalesReport: async (filters) =>
      createCoreRepository(getPrismaClient()).listSalesReport(filters),
    listPointsLiabilityReport: async (filters) =>
      createCoreRepository(getPrismaClient()).listPointsLiabilityReport(filters),
    listInventoryStatusReport: async () =>
      createCoreRepository(getPrismaClient()).listInventoryStatusReport(),
    listInventoryStatusLogReport: async (filters) =>
      createCoreRepository(getPrismaClient()).listInventoryStatusLogReport(filters),
    listAdjustmentRequests: async (filters) =>
      createCoreRepository(getPrismaClient()).listAdjustmentRequests(filters),
    listStaffUsers: async () => createCoreRepository(getPrismaClient()).listStaffUsers(),
    createStaffUser: async (input, actor) =>
      createCoreRepository(getPrismaClient()).createStaffUser(input, actor),
    updateStaffUser: async (userId, input, actor) =>
      createCoreRepository(getPrismaClient()).updateStaffUser(userId, input, actor),
    pullEvents: async (cursor, limit) =>
      createCoreRepository(getPrismaClient()).pullEvents(cursor, limit),
    getSyncStatus: async () => createCoreRepository(getPrismaClient()).getSyncStatus(),
  });
  server.on("close", () => {
    if (prismaClient !== null) {
      void prismaClient.$disconnect();
    }
  });
  server.listen(runtimeConfig.apiPort);
  return server;
};

if (isDirectExecution()) {
  void startApiServer();
}
