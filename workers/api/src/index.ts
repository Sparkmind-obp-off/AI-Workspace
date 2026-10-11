export interface Env {
  DB?: D1Database;
  AI_PROVIDER?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  ALLOWED_ORIGIN?: string;
}

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

const json = (data: unknown, status = 200, origin = "*") =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization"
    }
  });

function safeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ChatMessage =>
      item && ["user", "assistant", "system"].includes(item.role) &&
      typeof item.content === "string")
    .slice(-20)
    .map(({ role, content }) => ({ role, content: content.slice(0, 12000) }));
}

async function callProvider(env: Env, messages: ChatMessage[]): Promise<string> {
  const provider = (env.AI_PROVIDER || "").toLowerCase();
  if (provider === "gemini" && env.GEMINI_API_KEY) {
    const contents = messages.filter(m => m.role !== "system").map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
    const system = messages.find(m => m.role === "system")?.content;
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
      encodeURIComponent(env.GEMINI_API_KEY),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
        })
      }
    );
    if (!response.ok) throw new Error("Provider AI gagal (" + response.status + "). Periksa konfigurasi dan kuota.");
    const data = await response.json() as any;
    return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "Model tidak mengembalikan teks.";
  }
  if (provider === "groq" && env.GROQ_API_KEY) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer " + env.GROQ_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: messages.map(({ role, content }) => ({ role, content })),
        temperature: 0.7,
        max_tokens: 1200
      })
    });
    if (!response.ok) throw new Error("Provider AI gagal (" + response.status + "). Periksa konfigurasi dan kuota.");
    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || "Model tidak mengembalikan teks.";
  }
  return "Halo! AI Workspace sudah berjalan. Backend chat aktif dalam mode demo, tetapi provider AI belum dikonfigurasi. Setelah API key provider disimpan sebagai Worker secret dan AI_PROVIDER diatur, aku bisa menjawab menggunakan model AI. Tahap berikutnya adalah mengaktifkan penyimpanan D1, autentikasi, dan agent tools.";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || "*";
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization"
      }
    });

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, app: "ai-workspace", providerConfigured: Boolean(
        (env.AI_PROVIDER === "gemini" && env.GEMINI_API_KEY) ||
        (env.AI_PROVIDER === "groq" && env.GROQ_API_KEY)
      ), databaseConfigured: Boolean(env.DB) }, 200, origin);
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json() as { messages?: unknown; mode?: unknown };
        const messages = safeMessages(body.messages);
        if (!messages.length || !messages.some(m => m.role === "user")) {
          return json({ error: "Kirim setidaknya satu pesan pengguna." }, 400, origin);
        }
        const mode = body.mode === "agent" ? "agent" : "chat";
        const system: ChatMessage = {
          role: "system",
          content: mode === "agent"
            ? "Kamu adalah AI agent di AI Workspace. Saat ini tools eksekusi belum diaktifkan. Jangan mengaku telah menjalankan tindakan eksternal. Buat rencana langkah yang jelas dan tandai tindakan yang memerlukan persetujuan."
            : "Kamu adalah AI assistant di AI Workspace. Jawab dengan jelas, jujur, dan dalam bahasa yang digunakan pengguna. Jangan mengaku menggunakan tools yang tidak tersedia."
        };
        const reply = await callProvider(env, [system, ...messages]);
        return json({ reply, mode, demo: !(
          (env.AI_PROVIDER === "gemini" && env.GEMINI_API_KEY) ||
          (env.AI_PROVIDER === "groq" && env.GROQ_API_KEY)
        ) }, 200, origin);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Terjadi kesalahan pada backend." }, 502, origin);
      }
    }

    return json({ error: "Not found" }, 404, origin);
  }
};
