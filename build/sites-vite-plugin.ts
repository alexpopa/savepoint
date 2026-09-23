// Bundles the Sites hosting manifest and D1 migrations with each build.
import { access, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function sites(): Plugin {
  let root = process.cwd();
  let command: "build" | "serve" = "build";
  return {
    name: "sites",
    configResolved(config) {
      root = config.root;
      command = config.command;
    },
    async closeBundle() {
      if (command !== "build") return;
      const outputDirectory = resolve(root, "dist", ".openai");
      await rm(outputDirectory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });
      await cp(resolve(root, ".openai", "hosting.json"), resolve(outputDirectory, "hosting.json"));
      const drizzleSource = resolve(root, "drizzle");
      if (await exists(drizzleSource)) await cp(drizzleSource, resolve(outputDirectory, "drizzle"), { recursive: true });
    },
  };
}
