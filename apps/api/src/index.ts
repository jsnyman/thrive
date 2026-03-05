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
    getPersonById: async (personId) =>
      createCoreRepository(getPrismaClient()).getPersonById(personId),
    getMaterialById: async (materialId) =>
      createCoreRepository(getPrismaClient()).getMaterialById(materialId),
    getItemById: async (itemId) => createCoreRepository(getPrismaClient()).getItemById(itemId),
    appendEventAndProject: async (event) =>
      createCoreRepository(getPrismaClient()).appendEventAndProject(event),
    appendEvents: async (events) => createCoreRepository(getPrismaClient()).appendEvents(events),
    getLedgerBalance: async (personId) =>
      createCoreRepository(getPrismaClient()).getLedgerBalance(personId),
    listLedgerEntries: async (personId) =>
      createCoreRepository(getPrismaClient()).listLedgerEntries(personId),
    getLivePointsBalance: async (personId) =>
      createCoreRepository(getPrismaClient()).getLivePointsBalance(personId),
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
