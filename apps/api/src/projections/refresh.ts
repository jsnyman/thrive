type SqlExecutor = {
  $executeRawUnsafe: (sql: string) => Promise<unknown>;
};

const projectionSqlStatements = [
  "REFRESH MATERIALIZED VIEW mv_people",
  "REFRESH MATERIALIZED VIEW mv_points_ledger_entries",
  "REFRESH MATERIALIZED VIEW mv_points_balances",
  "REFRESH MATERIALIZED VIEW mv_inventory_status_summary",
];

export const refreshProjections = async (prisma: SqlExecutor): Promise<void> => {
  for (const statement of projectionSqlStatements) {
    await prisma.$executeRawUnsafe(statement);
  }
};
