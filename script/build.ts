import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];

  // Native modules that MUST be external (not bundled)
  const nativeModules = ["bcrypt", "@prisma/client", "prisma"];
  
  // Always externalize native modules + all fastify plugins
  const externals = [...new Set([
    ...nativeModules,
    ...allDeps.filter(dep => dep.startsWith("@fastify") || dep.startsWith("fastify")),
    ...allDeps.filter(dep => nativeModules.some(nm => dep.includes(nm))),
  ])];

  await esbuild({
    entryPoints: ["src/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  console.log("Build complete!");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
