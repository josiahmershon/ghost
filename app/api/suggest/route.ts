import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  SUGGESTION_SYSTEM_PROMPT,
  buildSuggestionUserMessage,
} from "@/lib/ai/prompts";
import type { SuggestionRequestBody } from "@/lib/ai/contextAssembler";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Simple in-memory rate limiter: max 30 req/min per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return new Response("Rate limit exceeded", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  let body: SuggestionRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  const {
    currentParagraph,
    previousParagraph,
    outline,
    sectionType,
    documentType,
    audience,
  } = body;

  if (!currentParagraph?.trim()) {
    return new Response("", { status: 200 });
  }

  const userMessage = buildSuggestionUserMessage({
    documentType: documentType ?? "essay",
    audience: audience ?? "general",
    sectionType: sectionType ?? "body",
    outline: outline ?? [],
    relevantChunks: [],
    previousParagraph: previousParagraph ?? null,
    currentParagraphUpToCursor: currentParagraph,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = anthropic.messages.stream({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 100,
          temperature: 0.7,
          system: SUGGESTION_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        });

        for await (const chunk of response) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch (err) {
        console.error("[/api/suggest]", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
