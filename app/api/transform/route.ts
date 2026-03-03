import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  TRANSFORM_SYSTEM_PROMPT,
  buildTransformUserMessage,
} from "@/lib/ai/prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  let body: {
    selectedText: string;
    beforeSelection: string;
    afterSelection: string;
    instruction: string;
    documentType: string;
    audience: string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  const { selectedText, beforeSelection, afterSelection, instruction } = body;

  if (!selectedText?.trim() || !instruction?.trim()) {
    return new Response("", { status: 200 });
  }

  const userMessage = buildTransformUserMessage({
    selectedText,
    beforeSelection,
    afterSelection,
    instruction,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          temperature: 0.5,
          system: TRANSFORM_SYSTEM_PROMPT,
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
        console.error("[/api/transform]", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
