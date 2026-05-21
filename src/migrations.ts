/**
 * Schema migration pipeline for persisted app settings.
 *
 * Each migration function takes data at version N and returns data at version N+1.
 * New migrations are appended to the `migrations` array.
 *
 * Current schema version: 1 (defined in constants.ts as STORAGE_SCHEMA_VERSION)
 */

import type { AppSettings } from "./types";
import { STORAGE_SCHEMA_VERSION } from "./constants";

/* ------------------------------------------------------------------ */
/*  Migration functions                                               */
/* ------------------------------------------------------------------ */

/** v0 → v1: Wrap legacy raw settings into versioned format */
function migrateV0toV1(data: unknown): AppSettings {
  // If data is already at v0 format (raw AppSettings object), return as-is.
  // Future migrations would transform fields here.
  return data as AppSettings;
}

/* ------------------------------------------------------------------ */
/*  Migration registry - ordered from oldest to newest                 */
/* ------------------------------------------------------------------ */

/**
 * Array of migration functions. Index i migrates from version i to i+1.
 */
const migrations: Array<(data: unknown) => AppSettings> = [
  migrateV0toV1, // v0 → v1
];

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Run the migration pipeline on settings data.
 *
 * @param data - Settings data at the given schema version.
 * @param fromVersion - Current schema version of the data.
 * @returns Migrated settings at the latest schema version.
 */
export function migrateSettings(
  data: AppSettings,
  fromVersion: number,
): AppSettings {
  // If already at latest version, no migration needed
  if (fromVersion >= STORAGE_SCHEMA_VERSION) {
    return data;
  }

  let current = data;
  for (let v = fromVersion; v < STORAGE_SCHEMA_VERSION; v++) {
    const migration = migrations[v];
    if (!migration) {
      // Missing migration - skip to avoid data loss
      continue;
    }
    current = migration(current);
  }
  return current;
}

/**
 * Check if a migration is needed for the given version.
 */
export function needsMigration(fromVersion: number): boolean {
  return fromVersion < STORAGE_SCHEMA_VERSION;
}
