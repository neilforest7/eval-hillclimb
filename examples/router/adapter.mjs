// Offline demonstration: intentionally weak baseline vs a rule-based candidate.
// This is a runner fixture, not a claim about any LLM's performance.
let data = "";
for await (const chunk of process.stdin) data += chunk;
const request = JSON.parse(data);
if (Object.hasOwn(request, "expected")) throw new Error("Label leaked to adapter");
const text = String(request.input).toLowerCase();
const version = process.argv[2] || "baseline";
if (!["baseline", "candidate"].includes(version)) throw new Error("Unknown demo version");
let output;
if (version === "baseline") {
  output = text.includes("refund") ? "refund" : text.includes("password") ? "account" : "general";
} else {
  output = /refund|money back|charged twice|duplicate charge|reimburse/.test(text) ? "refund"
    : /password|sign.in|log.in|locked out|account access|two.factor|2fa/.test(text) ? "account" : "general";
}
console.log(JSON.stringify({ output, model: "offline-router-" + version, cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } }));
