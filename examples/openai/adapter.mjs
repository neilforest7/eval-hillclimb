// Optional live adapter. Requires an API key and explicitly selected model/prices.
import fs from "node:fs/promises";
let text = "";
for await (const chunk of process.stdin) text += chunk;
const request = JSON.parse(text);
const model = process.env.OPENAI_MODEL;
if (!model || !process.env.OPENAI_API_KEY) throw new Error("Set OPENAI_MODEL and OPENAI_API_KEY");
const prompt = process.env.PROMPT_FILE ? await fs.readFile(process.env.PROMPT_FILE, "utf8") : "Complete the user's task accurately.";
const maxTokens = Number(process.env.MAX_OUTPUT_TOKENS || 1024);
if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new Error("MAX_OUTPUT_TOKENS must be a positive integer");
const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ model, instructions: prompt, input: typeof request.input === "string" ? request.input : JSON.stringify(request.input), max_output_tokens: maxTokens })
});
const body = await response.json();
if (!response.ok) throw new Error("OpenAI " + response.status + ": " + (body.error?.message || "request failed"));
if (body.status !== "completed") throw new Error("Response did not complete: " + body.status);
const output = (body.output || []).flatMap(item => item.content || [])
  .map(item => item.type === "output_text" ? item.text : item.type === "refusal" ? item.refusal : "")
  .filter(Boolean).join("\n");
if (!output) throw new Error("Response has no text output");
const usage = body.usage || {};
const cached = usage.input_tokens_details?.cached_tokens || 0;
const price = name => {
  if (process.env[name] === undefined || !process.env[name].trim()) return null;
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value < 0) throw new Error(name + " must be a non-negative price");
  return value;
};
const inputPrice = price("OPENAI_INPUT_USD_PER_MILLION");
const outputPrice = price("OPENAI_OUTPUT_USD_PER_MILLION");
const cachedPrice = price("OPENAI_CACHED_INPUT_USD_PER_MILLION");
let cost = null;
if (inputPrice !== null && outputPrice !== null && (!cached || cachedPrice !== null) &&
    Number.isFinite(usage.input_tokens) && Number.isFinite(usage.output_tokens)) {
  cost = ((usage.input_tokens - cached) * inputPrice + cached * (cachedPrice || 0) + usage.output_tokens * outputPrice) / 1e6;
}
console.log(JSON.stringify({ output, model: body.model, usage, cost_usd: cost,
  cost_source: cost === null ? "unknown" : "configured-price-estimate" }));
