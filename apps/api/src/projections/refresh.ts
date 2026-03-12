type SqlExecutor = {
  $executeRawUnsafe: (sql: string) => Promise<unknown>;
};

const projectionSqlStatements = [
  "REFRESH MATERIALIZED VIEW mv_people",
  "REFRESH MATERIALIZED VIEW mv_points_ledger_entries",
  "REFRESH MATERIALIZED VIEW mv_points_balances",
  "REFRESH MATERIALIZED VIEW mv_inventory_status_summary",
  "REFRESH MATERIALIZED VIEW mv_materials_collected_daily",
  `
    with latest as (
      select recorded_at, event_id
      from event
      order by recorded_at desc, event_id desc
      limit 1
    )
    insert into projection_freshness (key, refreshed_at, cursor_recorded_at, cursor_event_id)
    values (
      'default',
      now(),
      (select recorded_at from latest),
      (select event_id from latest)
    )
    on conflict (key)
    do update set
      refreshed_at = excluded.refreshed_at,
      cursor_recorded_at = excluded.cursor_recorded_at,
      cursor_event_id = excluded.cursor_event_id
  `,
];

export const refreshProjections = async (prisma: SqlExecutor): Promise<void> => {
  for (const statement of projectionSqlStatements) {
    await prisma.$executeRawUnsafe(statement);
  }
};
