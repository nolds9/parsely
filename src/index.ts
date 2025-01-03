#!/usr/bin/env node
import { Command } from "commander";
import { registerScanCommand } from "./commands/scan.js";
import { registerInitCommand } from "./commands/init.js";

async function main() {
  const program = new Command()
    .name("parsely")
    .description("CLI tool for importing recipes to Notion")
    .version("0.1.0");

  // Register commands
  registerInitCommand(program);
  registerScanCommand(program);
  // TODO: Register other commands (chop, serve)

  await program.parseAsync(process.argv);
}

main().catch(console.error);
