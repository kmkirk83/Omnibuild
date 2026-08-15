import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, float } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const tenantConfigs = mysqlTable("tenant_configs", {
  id: int("id").autoincrement().primaryKey(),
  workspaceName: varchar("workspace_name", { length: 128 }).notNull().default("Default Workspace"),
  shopifySecret: varchar("shopify_secret", { length: 255 }),
  stripeSecret: varchar("stripe_secret", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type TenantConfig = typeof tenantConfigs.$inferSelect;
export type InsertTenantConfig = typeof tenantConfigs.$inferInsert;

export const proxyEvents = mysqlTable("proxy_events", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 64 }).notNull(), // 'shopify' | 'stripe' | 'custom'
  eventType: varchar("event_type", { length: 128 }).default("unknown").notNull(),
  sourceDeliveryId: varchar("source_delivery_id", { length: 255 }),
  endpoint: varchar("endpoint", { length: 255 }).notNull(),
  method: varchar("method", { length: 16 }).notNull(),
  status: int("status").notNull(),
  latencyMs: float("latency_ms").notNull(),
  payload: text("payload"),
  signatureStatus: mysqlEnum("signature_status", ["not_configured", "not_present", "verified", "invalid"]).default("not_configured").notNull(),
  deliveryState: mysqlEnum("delivery_state", ["received", "delivered", "failed", "replayed"]).default("received").notNull(),
  attemptCount: int("attempt_count").default(1).notNull(),
  isDuplicate: int("is_duplicate").default(0).notNull(),
  replayedFromEventId: int("replayed_from_event_id"),
  lastError: text("last_error"),
  healed: int("healed").default(0).notNull(), // 0 = false, 1 = true
  healingDetails: text("healing_details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProxyEvent = typeof proxyEvents.$inferSelect;
export type InsertProxyEvent = typeof proxyEvents.$inferInsert;

export const schemaHealingLogs = mysqlTable("schema_healing_logs", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 64 }).notNull(),
  eventType: varchar("event_type", { length: 128 }).notNull(),
  fieldPath: varchar("field_path", { length: 255 }).notNull(),
  originalError: text("original_error").notNull(),
  patchApplied: text("patch_applied").notNull(),
  confidence: float("confidence").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SchemaHealingLog = typeof schemaHealingLogs.$inferSelect;
export type InsertSchemaHealingLog = typeof schemaHealingLogs.$inferInsert;

export const automationAgents = mysqlTable("automation_agents", {
  id: int("id").autoincrement().primaryKey(),
  agentName: varchar("agentName", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["active", "paused", "error"]).default("active").notNull(),
  targetService: varchar("targetService", { length: 64 }).notNull(),
  lastRunAt: timestamp("lastRunAt").defaultNow().notNull(),
  metricsJson: text("metricsJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AutomationAgent = typeof automationAgents.$inferSelect;
export type InsertAutomationAgent = typeof automationAgents.$inferInsert;
