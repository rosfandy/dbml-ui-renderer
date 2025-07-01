import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class SvgGenerator {
  constructor(config) {
    this.config = config;
  }

  async generateMainSvg() {
    try {
      await execAsync(
        `npx dbml-renderer -i ${this.config.outputDbml} -o ${this.config.outputSvg}`
      );
      console.log(`✅ schema.svg generated at ${this.config.outputSvg}`);
      return true;
    } catch (err) {
      console.error("❌ Error generating main schema.svg:", err);
      return false;
    }
  }

  async generateSvg(dbmlPath, svgPath, name) {
    try {
      await execAsync(`npx dbml-renderer -i ${dbmlPath} -o ${svgPath}`);
      console.log(`✅ ${name}.svg generated`);
      return true;
    } catch (err) {
      console.error(`❌ Failed to generate ${name}.svg:`, err);
      return false;
    }
  }
}
