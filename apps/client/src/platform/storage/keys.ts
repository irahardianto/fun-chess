/**
 * Centralized local and session storage keys used across Fun Chess client.
 * Adheres to Architectural Patterns Rule 1, db_contracts §2, and Finding MIN-034.
 */
export * from './storage_keys';

// Re-export migration logic extracted per MIN-016 & MIN-018
export { migrateStorageV1ToV2, type MigrationOutcome } from './migration';
