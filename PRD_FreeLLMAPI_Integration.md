# PRD: FreeLLMAPI Integration for BPSC Testing Platform

> **Project:** BPSC Testing Platform (bpscpro.online)
> **Date:** May 28, 2026
> **Status:** Draft

---

## 1. Executive Summary

Replace the current direct-to-Gemini AI calls with **FreeLLMAPI** — a self-hosted proxy that aggregates free tiers from 12+ LLM providers behind a single OpenAI-compatible endpoint. This increases daily AI capacity from **40 requests/day** (2 Gemini models at 20 RPD each) to **~1000+ requests/day** across ~50 models, with automatic fallback when any provider hits rate limits.

---

## 2. Current Architecture

```
User clicks button (Explain / Study Plan / etc.)
        ↓
Next.js API Route (e.g. /api/ai/explain-options)
        ↓
lib/ai.ts → generateWithFallback()
        ↓
Google Generative AI SDK (2 models)
  ├─ gemini-2.5-flash  (20 RPD)  ← custom fallback logic
  └─ gemini-3.5-flash  (20 RPD)  ← custom fallback logic
        ↓
Returns text → parsed JSON → sent to user
```

**Current limitations:**
- Single provider (Google Gemini) — 40 requests/day total across all features
- Custom fallback code in `src/lib/ai.ts` with manual rate-limit tracking via `AiRequestLog`
- No provider diversity — when Gemini is down, everything fails
- No cooldown management — retry logic is simplistic

---

## 3. Target Architecture

```
User clicks button
        ↓
Next.js API Route (unchanged)
        ↓
lib/ai.ts → generateWithFallback()
        │
        ├── TRY PRIMARY: FreeLLMAPI (localhost:3001)  ← NEW
        │     │
        │     ├─ Google Gemini (via FreeLLMAPI, 50 RPD)
        │     ├─ GPT-4o via GitHub Models (50 RPD)
        │     ├─ Llama 4 via Groq (30 RPD)
        │     ├─ Qwen3 via Cerebras (fast)
        │     ├─ Mistral Large 3 / Codestral
        │     ├─ OpenRouter (21 free models)
        │     ├─ Cloudflare K2 / GLM-4.7
        │     └─ HuggingFace router → DeepSeek V4 / Kimi K2.6
        │     │
        │     └── Auto-fallback across 50+ models, 12 providers
        │
        └── IF FreeLLMAPI fails (rare):
              ↓
              BACKUP: Existing Gemini system (unchanged)
                    ├─ gemini-2.5-flash (20 RPD)
                    └─ gemini-3.5-flash (20 RPD)
```

---

## 4. Strategy: FreeLLMAPI Primary → Gemini Backup

```
generateWithFallback(prompt) {
  // PRIMARY: FreeLLMAPI (50+ models, 12 providers, 1000+ req/day)
  try {
    return await freeLLMApiCall(prompt);
  } catch (err) {
    log("FreeLLMAPI failed, falling back to Gemini");
  }

  // BACKUP: existing Gemini system (40 req/day safety net)
  return await existingGeminiLogic(prompt);
}
```

This means:
- **Normal load**: FreeLLMAPI handles everything — massive capacity
- **Rare FreeLLMAPI failure** (all providers rate-limited, network issue): Gemini catches it
- **Gemini only sees overflow/scraps** — your 40 req/day Gemini quota will almost never be touched
- **Zero changes to existing API routes, DB, or frontend**

## 5. Capacity Comparison

| Metric | Current (Gemini only) | With FreeLLMAPI |
|---|---|---|
| Total daily capacity | ~40 requests/day | ~1000+ requests/day |
| Available models | 2 | ~50+ |
| Providers | 1 | 12+ |
| Admin: Fill Answers (batches) | ~10 batches/day | ~100+ batches/day |
| Student: Explain Options | ~20 req/day | ~200+ req/day |
| Student: Study Plan | ~10 req/day | ~100+ req/day |
| Performance Analysis | ~10 req/day | ~100+ req/day |
| Token budget / month | ~10M tokens | ~1B+ tokens |
| Automatic fallback | Custom code (2 models) | Built-in (across providers) |
| Rate-limit handling | Manual DB tracking | Built-in cooldowns + rotation |

---

## 6. Integration Plan

### 6.1 Setup FreeLLMAPI

```bash
# On your server (same machine as Next.js app, or same LAN)
cd /opt/freellmapi
git clone https://github.com/tashfeenahmed/freellmapi.git .
npm install
cp .env.example .env

# Generate encryption key
echo "ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> .env

# Build for production
npm run build
```

### 6.2 Add Provider Keys

Access the dashboard at `http://localhost:3001` and add API keys for each provider. Minimum recommended:

| Provider | Sign up at | What you get |
|---|---|---|
| Google AI | aistudio.google.com | Gemini 2.5 Flash (50 RPD) |
| Groq | console.groq.com | Llama 3.3, Llama 4 (30 RPD each) |
| Cerebras | cloud.cerebras.ai | Qwen3, Llama (fast inference) |
| Mistral | console.mistral.ai | Large 3, Codestral, Devstral |
| OpenRouter | openrouter.ai | 21 free models |
| GitHub Models | github.com/marketplace/models | GPT-4.1, GPT-4o, DeepSeek |
| Cloudflare | workers.ai | Kimi K2, GLM-4.7 |
| HuggingFace | huggingface.co | DeepSeek V4, Kimi K2.6 |

### 6.3 Run as a Service

```bash
# Using PM2
npm install -g pm2
pm2 start server/dist/index.js --name freellmapi
pm2 save
pm2 startup   # auto-start on reboot
```

### 6.4 Modify BPSC Platform Code

#### File: `src/lib/ai.ts` — FreeLLMAPI primary, Gemini backup

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// ── FreeLLMAPI primary client (NEW) ──
const freeLLM = new OpenAI({
  baseURL: process.env.FREELLMAPI_URL || "http://localhost:3001/v1",
  apiKey: process.env.FREELLMAPI_KEY || "",
});

// ── Existing constants (unchanged) ──
const AI_MODELS = [
  { id: "gemini-2.5-flash", rpd: 20 },
  { id: "gemini-3.5-flash", rpd: 20 },
];

// ── pickBestModel(), logAiRequest(), canUseAiResponse(), etc. remain exactly as-is ──

// ── generateWithFallback: FreeLLMAPI first, Gemini backup ──
export async function generateWithFallback(
  prompt: string,
  options?: { purpose?: string; userId?: string }
): Promise<string> {
  const purpose = options?.purpose || "general";
  const userId = options?.userId;

  // ── PRIMARY: FreeLLMAPI (50+ models, 12 providers, auto-fallback) ──
  try {
    const resp = await freeLLM.chat.completions.create({
      model: "auto",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const text = resp.choices?.[0]?.message?.content || "";
    const routedVia = resp.headers?.get("x-routed-via") || "unknown";
    console.log(`[AI] FreeLLMAPI/${routedVia} (purpose: ${purpose})`);
    await logAiRequest({ model: `freellmapi/${routedVia}`, purpose, status: "success", promptLength: prompt.length, responseLength: text.length, userId });
    return text;
  } catch (primaryErr: any) {
    console.warn("[AI] FreeLLMAPI failed, falling back to Gemini:", primaryErr.message?.slice(0, 100));
  }

  // ── BACKUP: existing Gemini logic (unchanged) ──
  try {
    const bestModel = await pickBestModel();
    const orderedModels = [bestModel, ...AI_MODELS.map(m => m.id).filter(id => id !== bestModel)];
    let lastError: any;

    for (const modelName of orderedModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        if (text) {
          console.log(`[AI] Gemini backup success: ${modelName}`);
          await logAiRequest({ model: modelName, purpose, status: "success", promptLength: prompt.length, responseLength: text.length, userId });
          return text;
        }
      } catch (err: any) {
        lastError = err;
        const msg = err.message || String(err);
        console.warn(`[AI] Gemini ${modelName} failed: ${msg}`);
        await logAiRequest({ model: modelName, purpose, status: "failed", promptLength: prompt.length, errorMessage: msg.slice(0, 500), userId });
      }
    }
    throw lastError;
  } catch (backupErr: any) {
    console.error("[AI] Both FreeLLMAPI and Gemini failed:", backupErr.message);
    await logAiRequest({ model: "gemini-fallback", purpose, status: "failed", promptLength: prompt.length, errorMessage: backupErr.message?.slice(0, 500), userId });
    throw new Error(`FreeLLMAPI + Gemini both failed: ${backupErr.message}`);
  }
}
```

Add to your `.env`:
```
FREELLMAPI_URL=http://localhost:3001/v1
FREELLMAPI_KEY=freellmapi-your-unified-key
```

#### File: `src/lib/ingestion.ts` — For OCR/vision tasks

These functions use Gemini directly for **file processing** (PDFs, images). Keep Gemini for these since FreeLLMAPI doesn't support multimodal yet:

```typescript
// KEEP as-is (Gemini direct — for Vision/OCR only):
// - extractQuestionsViaVision()
// - extractViaGeminiFilesApi()
// - extractQuestionsViaAi()
// - generateMCQsFromContent()

// For fillMissingFields() — optionally switch to FreeLLMAPI:
import OpenAI from "openai";
const llm = new OpenAI({
  baseURL: process.env.FREELLMAPI_URL || "http://localhost:3001/v1",
  apiKey: process.env.FREELLMAPI_KEY || "",
});
```

### 6.5 Environment Variables

Add to `bpsc-platform/.env.local`:
```bash
# FreeLLMAPI (PRIMARY — handles all requests, 50+ models, 1000+ req/day)
FREELLMAPI_URL=http://localhost:3001/v1
FREELLMAPI_KEY=freellmapi-xxxxxx

# GEMINI_API_KEY stays as BACKUP (only used when FreeLLMAPI is unavailable)
GEMINI_API_KEY=AIza...
```

---

## 7. Deployment Steps

| # | Step | Who |
|---|---|---|
| 1 | Deploy FreeLLMAPI server on the same machine as the Next.js app | Admin |
| 2 | Add ENCRYPTION_KEY and start FreeLLMAPI | Admin |
| 3 | Open Dashboard → Add provider keys (Google, Groq, Cerebras, etc.) | Admin |
| 4 | Copy unified API key from Dashboard → Keys page | Admin |
| 5 | Add FREELLMAPI_URL and FREELLMAPI_KEY to `.env.local` | Admin |
| 6 | Update `src/lib/ai.ts` — FreeLLMAPI primary, Gemini backup | Dev |
| 7 | Keep `src/lib/ingestion.ts` using Gemini for Vision/OCR | Dev |
| 8 | Deploy updated Next.js app | Admin |
| 9 | Monitor FreeLLMAPI dashboard → Analytics for usage patterns | Admin |
| 10 | Check `AiRequestLog` to confirm Gemini backup is rarely invoked | Admin |

---

## 8. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Free tier ToS violation | Low | README ToS review says personal/team use is OK. Don't sell API access. |
| Provider drops free tier | Medium | FreeLLMAPI auto-skips dead models. Add new providers as they appear. |
| Latency variability | Low | Router picks fastest available. Students won't notice 2s vs 5s. |
| Server resource usage | None | FreeLLMAPI ~40MB RAM idle, negligible CPU. |
| Single point of failure | Medium | If FreeLLMAPI crashes, all AI features stop. Use PM2 auto-restart. |

---

## 9. Monitoring

- **FreeLLMAPI Analytics**: `http://localhost:3001` → Analytics tab (24h/7d/30d views)
- **FreeLLMAPI Health**: `GET http://localhost:3001/api/ping`
- **BPSC existing**: `AiRequestLog` table continues to track per-feature usage
- **Student limits**: Your existing `dailyAiResponseLimit` and `canUseAiResponse()` remain unchanged

---

## 10. Rollback Plan

If issues arise:
1. Revert `src/lib/ai.ts` to the current `@google/generative-ai` SDK version
2. Re-deploy Next.js app
3. `pm2 stop freellmapi` if needed
4. System returns to current Gemini-only state with 40 req/day

---

## 11. Request Flow Summary

```
User clicks button
        ↓
Your API route (unchanged)
        ↓
generateWithFallback(prompt)
        │
        ├── TRY PRIMARY: FreeLLMAPI (50+ models across 12 providers)
        │     │
        │     ├── Google Gemini (50 RPD)
        │     ├── GPT-4o via GitHub Models (50 RPD)
        │     ├── Llama 4 via Groq (30 RPD)
        │     ├── Qwen3 via Cerebras (fast)
        │     ├── Mistral Large 3 / Codestral
        │     ├── OpenRouter (21 models)
        │     ├── Cloudflare K2 / GLM-4.7
        │     └── HuggingFace router
        │     │
        │     └── If one provider hits limit → auto-falls to next (up to 20 attempts)
        │
        └── IF FreeLLMAPI fails (all providers exhausted / network issue):
              │
              └── BACKUP: Existing Gemini system
                    ├─ gemini-2.5-flash (20 RPD)
                    └─ gemini-3.5-flash (20 RPD)
```

**Result:**
- FreeLLMAPI handles **all** student + admin requests (1000+ req/day capacity)
- Gemini backup is **rarely touched** — only if FreeLLMAPI itself is down
- Zero changes to your existing API routes, database, or frontend

## 12. Quick Reference: Key Files Changed

| File | Action | Notes |
|---|---|---|
| `bpsc-platform/src/lib/ai.ts` | **Modify** `generateWithFallback` | FreeLLMAPI primary, Gemini as backup fallback |
| `bpsc-platform/src/lib/ingestion.ts` | **No change needed** | Already uses Gemini directly for Vision/OCR |
| `bpsc-platform/src/lib/study-plan.ts` | **No change needed** | Calls `generateWithFallback`, inherits new order |
| All API routes | **No change needed** | All call `generateWithFallback` or `ingestion.ts` |
| `bpsc-platform/.env.local` | **Add** `FREELLMAPI_URL` + `FREELLMAPI_KEY` | |
