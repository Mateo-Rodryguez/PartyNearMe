export interface ModerationResult {
  flagged: boolean;
  /** Names of the categories that were flagged, e.g. "sexual", "violence/graphic". */
  categories: string[];
}

export interface Moderator {
  /** Checks one image, with optional text, for content not allowed on the app. */
  check(input: { text?: string | null; image?: { body: Buffer; contentType: string } }): Promise<ModerationResult>;
}

interface OpenAiModerationResponse {
  results: { flagged: boolean; categories: Record<string, boolean> }[];
}

/** OpenAI's free moderation endpoint, which checks images and text together. */
export function openAiModerator(apiKey: string, doFetch: typeof fetch = fetch): Moderator {
  return {
    async check({ text, image }) {
      const input: unknown[] = [];
      if (text) input.push({ type: "text", text });
      if (image) {
        input.push({
          type: "image_url",
          image_url: { url: `data:${image.contentType};base64,${image.body.toString("base64")}` },
        });
      }
      if (input.length === 0) return { flagged: false, categories: [] };

      const res = await doFetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "omni-moderation-latest", input }),
      });
      if (!res.ok) throw new Error(`Moderation request failed: ${res.status}`);
      const body = (await res.json()) as OpenAiModerationResponse;
      const categories = new Set<string>();
      let flagged = false;
      for (const result of body.results) {
        flagged ||= result.flagged;
        for (const [name, hit] of Object.entries(result.categories)) if (hit) categories.add(name);
      }
      return { flagged, categories: [...categories].sort() };
    },
  };
}
