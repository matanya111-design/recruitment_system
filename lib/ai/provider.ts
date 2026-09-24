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

function useAnthropicDirect(): boolean {
  return (process.env.AI_PROVIDER ?? "").toLowerCase() === "anthropic";
}

export function isAiConfigured(): boolean {
  return useAnthropicDirect() ? !!process.env.ANTHROPIC_API_KEY : !!process.env.OPENAI_API_KEY;
}

export async function generateStructured<T>(args: AiGenerateArgs): Promise<AiResult<T>> {
  if (useAnthropicDirect()) return generateStructuredAnthropic<T>(args);
  return generateStructuredOpenAi<T>(args);
}

export type AiStreamEvent<T> =
  | { type: "delta"; text: string }
  | { type: "done"; result: AiResult<T> }
  | { type: "error"; message: string };

// Streaming variant — yields raw JSON text as the model writes it, so the caller can show live
// progress instead of a blank screen for the whole (often 1-3 minute) generation.
export async function* generateStructuredStream<T>(args: AiGenerateArgs): AsyncGenerator<AiStreamEvent<T>> {
  if (useAnthropicDirect()) {
    yield* generateStructuredAnthropicStream<T>(args);
    return;
  }
  // No streaming wired for the CodeMie/OpenAI path yet — emit the whole result as one "done" event.
  try {
    const result = await generateStructuredOpenAi<T>(args);
    yield { type: "done", result };
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : "AI error" };
  }
}

async function* generateStructuredAnthropicStream<T>(args: AiGenerateArgs): AsyncGenerator<AiStreamEvent<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { yield { type: "error", message: "ANTHROPIC_API_KEY is not configured" }; return; }

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  const maxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS ?? 8192);

  const body = {
    model,
    max_tokens: maxTokens,
    stream: true,
    system: [{ type: "text", text: args.instructions, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: args.input }],
    tools: [{ name: args.schemaName, description: "Return the structured output for this task.", input_schema: args.jsonSchema }],
    tool_choice: { type: "tool", name: args.schemaName },
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const err = await response.text().catch(() => response.statusText);
    yield { type: "error", message: `Anthropic API error ${response.status}: ${err}` };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let jsonAccum = "";
  let modelName = model;
  let inputTokens = 0, outputTokens = 0, cachedTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const evt of events) {
      const dataLine = evt.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
      const type = payload.type as string;
      if (type === "message_start") {
        const msg = payload.message as Record<string, unknown> | undefined;
        modelName = String(msg?.model ?? model);
        const usage = msg?.usage as Record<string, unknown> | undefined;
        inputTokens = Number(usage?.input_tokens ?? 0);
        cachedTokens = Number(usage?.cache_read_input_tokens ?? 0);
      } else if (type === "content_block_delta") {
        const delta = payload.delta as Record<string, unknown> | undefined;
        if (delta?.type === "input_json_delta") {
          const chunk = String(delta.partial_json ?? "");
          jsonAccum += chunk;
          yield { type: "delta", text: chunk };
        }
      } else if (type === "message_delta") {
        const usage = payload.usage as Record<string, unknown> | undefined;
        if (usage?.output_tokens != null) outputTokens = Number(usage.output_tokens);
      } else if (type === "error") {
        const errObj = payload.error as Record<string, unknown> | undefined;
        yield { type: "error", message: String(errObj?.message ?? "Anthropic stream error") };
        return;
      }
    }
  }

  try {
    const data = JSON.parse(jsonAccum) as T;
    yield { type: "done", result: { data, model: modelName, usage: { input: inputTokens, cached: cachedTokens, output: outputTokens } } };
  } catch {
    yield { type: "error", message: "לא ניתן היה לפענח את הפלט המלא מה-AI" };
  }
}

// Direct Anthropic Messages API — uses your own Anthropic account key, no CodeMie proxy involved.
async function generateStructuredAnthropic<T>(args: AiGenerateArgs): Promise<AiResult<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  const maxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS ?? 8192);

  const body = {
    model,
    max_tokens: maxTokens,
    // cache_control on the (large, mostly-static) instructions — repeat evaluations reuse this
    // cached prefix, cutting both cost and prefill latency on cache hits.
    system: [{ type: "text", text: args.instructions, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: args.input }],
    tools: [{ name: args.schemaName, description: "Return the structured output for this task.", input_schema: args.jsonSchema }],
    tool_choice: { type: "tool", name: args.schemaName },
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const raw = await response.json() as Record<string, unknown>;
  const content = raw.content as Array<Record<string, unknown>> | undefined;
  const toolUse = content?.find((c) => c.type === "tool_use");
  if (!toolUse) throw new Error("No tool_use output from Anthropic response");

  const usage = raw.usage as Record<string, unknown> | undefined;
  const inputTokens = Number(usage?.input_tokens ?? 0);
  const outputTokens = Number(usage?.output_tokens ?? 0);
  const cachedTokens = Number(usage?.cache_read_input_tokens ?? 0);

  return {
    data: toolUse.input as T,
    model: String(raw.model ?? model),
    usage: { input: inputTokens, cached: cachedTokens, output: outputTokens },
  };
}

// OpenAI-compatible API — used for the CodeMie proxy (Chat Completions) or native OpenAI (Responses API).
async function generateStructuredOpenAi<T>(args: AiGenerateArgs): Promise<AiResult<T>> {
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
  else if (model.includes("opus")) { inputRate = 15; cachedRate = 1.5; outputRate = 75; }
  else if (model.includes("haiku")) { inputRate = 0.8; cachedRate = 0.08; outputRate = 4; }
  else if (model.includes("sonnet")) { inputRate = 3; cachedRate = 0.3; outputRate = 15; }

  return (
    ((usage.input - usage.cached) * inputRate +
      usage.cached * cachedRate +
      usage.output * outputRate) /
    1_000_000
  );
}
