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
    { refreshProjections },
  ] = await Promise.all([
    import("./auth/staff-users.js"),
    import("./http/config.js"),
    import("./prisma.js"),
    import("./data/core-repository.js"),
    import("./projections/refresh.js"),
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
    createPerson: async (input) => createCoreRepository(getPrismaClient()).createPerson(input),
    listMaterials: async () => createCoreRepository(getPrismaClient()).listMaterials(),
    createMaterial: async (input) => createCoreRepository(getPrismaClient()).createMaterial(input),
    listItems: async () => createCoreRepository(getPrismaClient()).listItems(),
    createItem: async (input) => createCoreRepository(getPrismaClient()).createItem(input),
    getLedgerBalance: async (personId) => createCoreRepository(getPrismaClient()).getLedgerBalance(personId),
    listLedgerEntries: async (personId) => createCoreRepository(getPrismaClient()).listLedgerEntries(personId),
    refreshProjections: async () => refreshProjections(getPrismaClient()),
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
