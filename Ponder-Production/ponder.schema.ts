import { onchainTable } from "ponder";

export const syncLog = onchainTable("sync_log", (t) => ({
  id: t.text().primaryKey(),
  event: t.text().notNull(),
  processedAt: t.integer().notNull(),
}));
