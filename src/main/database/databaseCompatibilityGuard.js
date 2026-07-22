import { getMetaValue, setMetaValue } from "./databaseIdentity.js";

const CURRENT_SCHEMA_VERSION = 1;
const MINIMUM_SUPPORTED_SCHEMA = 1;
const SCHEMA_VERSION_KEY = "schema_version";

export function getBuildManifest(appVersion) {
  return {
    applicationVersion: appVersion || "0.0.0",
    minimumSupportedSchema: MINIMUM_SUPPORTED_SCHEMA,
    targetSchema: CURRENT_SCHEMA_VERSION,
    maximumSupportedSchema: CURRENT_SCHEMA_VERSION,
    releaseChannel: process.env.GII_GEM_ERP_RELEASE_CHANNEL || "stable",
    gitCommit: process.env.GII_GEM_ERP_GIT_COMMIT || "",
    buildDate: new Date().toISOString(),
  };
}

export function checkDatabaseCompatibility(db, appVersion, manifest) {
  const m = manifest || getBuildManifest(appVersion);
  const dbSchemaVersion = Number(getMetaValue(db, SCHEMA_VERSION_KEY) || 0);

  if (dbSchemaVersion === 0) {
    return { compatible: true, action: "fresh", schemaVersion: 0, targetSchema: m.targetSchema };
  }

  if (dbSchemaVersion > m.maximumSupportedSchema) {
    return {
      compatible: false,
      action: "newer",
      schemaVersion: dbSchemaVersion,
      appMaxSchema: m.maximumSupportedSchema,
      message: `This database was created by a newer version of the application (schema ${dbSchemaVersion}). Please update the application to open this database.`
    };
  }

  if (dbSchemaVersion < m.minimumSupportedSchema) {
    return {
      compatible: false,
      action: "too-old",
      schemaVersion: dbSchemaVersion,
      appMinSchema: m.minimumSupportedSchema,
      message: `This database schema (${dbSchemaVersion}) is too old for direct upgrade. A staged upgrade path is required.`
    };
  }

  if (dbSchemaVersion < m.targetSchema) {
    return { compatible: true, action: "migrate", schemaVersion: dbSchemaVersion, targetSchema: m.targetSchema };
  }

  return { compatible: true, action: "current", schemaVersion: dbSchemaVersion, targetSchema: m.targetSchema };
}
