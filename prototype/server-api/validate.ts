import { z } from "zod";
import database from "./db.json";
import { ApiDatabaseSchema } from "./contracts";

const result = ApiDatabaseSchema.safeParse(database);

if (!result.success) {
  throw new Error(z.prettifyError(result.error));
}

console.log("API seed data matches the Zod contracts.");
