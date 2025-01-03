#!/usr/bin/env node
import { Command } from "commander";
import { registerScanCommand } from "./commands/scan.js";
import { registerInitCommand } from "./commands/init.js";
import { registerChopCommand } from "./commands/chop.js";
import { registerPlateCommand } from "./commands/plate.js";

async function main() {
  const program = new Command()
    .name("parsely")
    .description("CLI tool for importing recipes to Notion")
    .version("0.1.0");

  // Register commands
  registerInitCommand(program);
  registerScanCommand(program);
  registerChopCommand(program);
  registerPlateCommand(program);

  await program.parseAsync(process.argv);
}

main().catch(console.error);
