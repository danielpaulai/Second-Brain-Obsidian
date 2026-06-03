/**
 * AI SDK v4 hardcodes a default `temperature: 0` and ALWAYS sends it (see the `// TODO v5 remove
 * default 0 for temperature` in the `ai` package). Opus 4.x has DEPRECATED `temperature` and the
 * Anthropic API now 400s when it's present ("temperature is deprecated for this model"). There is no
 * SDK switch to suppress the default, so we strip `temperature` from the outgoing request body.
 *
 * Pass this as the `fetch` option to `createAnthropic({ apiKey, fetch: anthropicFetch })`. Harmless
 * for any Claude model — they simply use their own default sampling.
 */
export const anthropicFetch: typeof fetch = async (input, init) => {
  if (init && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      if (body && typeof body === "object" && "temperature" in body) {
        delete body.temperature;
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      /* body isn't JSON — forward untouched */
    }
  }
  return fetch(input, init);
};
