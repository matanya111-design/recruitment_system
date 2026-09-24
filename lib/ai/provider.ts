export type AiUsage = { input: number; cached: number; output: number };

export type AiResult<T> = {
  data: T;
  model: string;
  usage: AiUsage;
};

export type AiGenerateArgs = {
  operation: string;
  instructions: string;
  input: string;
  schemaName: string;
  jsonSchema: object;
  reasoningEffort?: "low" | "medium" | "high";
};

export async function generateStructured<T>(args: AiGenerateArgs): Promise<AiResult<T>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const model = process.env.OPENAI_MODEL ?? "gpt-5.6-terra";
  const reasoningEffort = args.reasoningEffort ?? (process.env.OPENAI_REASONING_EFFORT as "low" | "medium" | "high") ?? "medium";
  // CodeMie proxy uses /chat/completions; fallback uses native OpenAI /responses
  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const isProxy = !!process.env.OPENAI_BASE_URL;

  let response: Response;

  if (isProxy) {
    // Chat Completions format (CodeMie, Azure, Anthropic, or any OpenAI-compatible proxy)
    const body = {
      model,
      messages: [
        { role: "system", content: args.instructions },
        { role: "user", content: args.input },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: args.schemaName, schema: args.jsonSchema, strict: true },
      },
    };
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } else {
    // Native OpenAI Responses API (fallback when no OPENAI_BASE_URL)
    const body: Record<string, unknown> = {
      model,
      store: false,
      reasoning: { effort: reasoningEffort },
      input: [
        { role: "system", content: args.instructions },
        { role: "user", content: args.input },
      ],
      text: {
        format: { type: "json_schema", name: args.schemaName, schema: args.jsonSchema, strict: true },
      },
    };
    response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`AI API error ${response.status}: ${err}`);
  }

  const raw = await response.json() as Record<string, unknown>;
  const usage = raw.usage as Record<string, unknown> | undefined;
  const inputTokens = Number(usage?.input_tokens ?? (usage?.prompt_tokens ?? 0));
  const outputTokens = Number(usage?.output_tokens ?? (usage?.completion_tokens ?? 0));
  const inputDetails = usage?.input_tokens_details as Record<string, unknown> | undefined;
  const cachedTokens = Number(inputDetails?.cached_tokens ?? 0);

  // Support both Chat Completions (proxy) and OpenAI Responses API formats
  let textValue: string | undefined;
  if (isProxy) {
    // Chat Completions: choices[0].message.content
    const choices = raw.choices as Array<Record<string, unknown>> | undefined;
    textValue = (choices?.[0]?.message as Record<string, unknown> | undefined)?.content as string | undefined;
  } else {
    // Responses API: output[].content[].text
    const output = raw.output as Array<Record<string, unknown>> | undefined;
    const textContent = output?.find((o) => o.type === "message");
    const contentArr = textContent?.content as Array<Record<string, unknown>> | undefined;
    textValue = contentArr?.find((c) => c.type === "output_text")?.text as string | undefined;
  }

  if (!textValue) throw new Error("No text output from AI response");

  const data = JSON.parse(textValue) as T;

  return {
    data,
    model: String(raw.model ?? model),
    usage: { input: inputTokens, cached: cachedTokens, output: outputTokens },
  };
}

export function estimateCost(model: string, usage: AiUsage): number {
  // Rates per million tokens
  let inputRate = 2, cachedRate = 0.2, outputRate = 12;
  if (model.includes("sol")) { inputRate = 5; cachedRate = 0.5; outputRate = 30; }
  else if (model.includes("luna")) { inputRate = 0.2; cachedRate = 0.02; outputRate = 1.2; }

  return (
    ((usage.input - usage.cached) * inputRate +
      usage.cached * cachedRate +
      usage.output * outputRate) /
    1_000_000
  );
}
