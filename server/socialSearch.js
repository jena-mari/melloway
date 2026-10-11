// Some search-capable models reject domain filters. Retry only that explicit
// compatibility error; the caller must still validate source URLs itself.
export async function socialSearchResponse(key, body, fetcher = fetch, timeout = 30000) {
  const signal = AbortSignal.timeout(timeout);
  const send = payload => fetcher("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal, body: JSON.stringify(payload),
  });
  const response = await send(body);
  if (response.status !== 400 || !body.tools?.some(tool => tool.filters) || typeof response.clone !== "function") return response;
  const failure = await response.clone().json().catch(() => ({}));
  const error = failure?.error;
  const text = `${typeof error?.param === "string" ? error.param : ""} ${typeof error?.message === "string" ? error.message : ""}`;
  if (!/filters/i.test(text) || !/unsupported|not supported/i.test(text)) return response;
  return send({ ...body, tools: body.tools.map(({ filters, ...tool }) => tool) });
}
