import { z } from "zod";

export const ConfigSchema = z.object({
  notion: z.object({ auth: z.string(), databaseId: z.string() }),
  ai: z.object({
    anthropicKey: z.string().optional(),
    openaiKey: z.string().optional(),
    defaultModel: z.enum(["claude", "gpt4"]).default("claude"),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
