import { join } from "path";

export const config = {
  port: 3123,
  schemaDir: join(process.cwd(), "schema"),
  get tablesDir() {
    return join(this.schemaDir, "tables");
  },
  get svgDir() {
    return join(this.schemaDir, "dist");
  },
  get outputDbml() {
    return join(this.schemaDir, "schema.dbml");
  },
  get outputSvg() {
    return join(this.schemaDir, "schema.svg");
  },
};
