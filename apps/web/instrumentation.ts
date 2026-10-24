function exitProcess(code: number): void {
  const runtime = process as unknown as {
    exit?: (value: number) => void;
  };
  runtime.exit?.(code);
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { validateRuntimeConfig } = await import("./src/lib/config");
  try {
    const report = validateRuntimeConfig();
    for (const warning of report.warnings) {
      console.warn(JSON.stringify({ event: "config_warning", warning }));
    }
    console.info(
      JSON.stringify({
        event: "startup",
        production: report.production,
        llmEnabled: process.env.LLM_ENABLED !== "0",
        emailProvider: process.env.EMAIL_PROVIDER ?? "auto",
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "startup_config_invalid",
        reason: error instanceof Error ? error.message : "unknown",
      }),
    );
    exitProcess(1);
  }
}
