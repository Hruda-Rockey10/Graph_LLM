"use client";

import { FormEvent, useState } from "react";
import type { ChatMessage } from "@/lib/types";

type Props = {
  onAsk: (question: string) => Promise<void>;
  messages: ChatMessage[];
  loading: boolean;
};

export function ChatPanel({ onAsk, messages, loading }: Props) {
  const [question, setQuestion] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setQuestion("");
    await onAsk(trimmed);
  }

  return (
    <aside className="flex h-full w-[330px] min-w-[330px] flex-col border-l border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <p className="text-[18px] font-semibold text-gray-900">Chat with Graph</p>
        <p className="text-xs text-gray-500">Order to Cash</p>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-black text-white">D</div>
          <div>
            <p className="font-semibold text-gray-900">Dodge AI</p>
            <p className="text-xs text-gray-500">Graph Agent</p>
            <p className="mt-2 text-sm text-gray-800">
              Hi! I can help you analyze the Order to Cash process.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {messages.map((msg, idx) => (
            <div key={`${idx}-${msg.role}`} className={msg.role === "user" ? "ml-8" : "mr-8"}>
              <div
                className={
                  msg.role === "user"
                    ? "rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white"
                    : "rounded-xl bg-zinc-100 px-3 py-2 text-sm text-gray-800"
                }
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-gray-200 p-3">
        <div className="rounded-xl border border-gray-200 bg-[#fafafa] p-2">
          <p className="mb-2 text-[11px] font-medium text-green-700">Dodge AI is awaiting instructions</p>
          <textarea
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Analyze anything"
            className="w-full resize-none bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
          />
          <div className="mt-2 flex justify-end">
            <button
              disabled={loading}
              type="submit"
              className="rounded-lg bg-gray-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
}
