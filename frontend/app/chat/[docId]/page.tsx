"use client";

import { useEffect, useReducer, useState } from "react";
import { motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChatDrawer, Message } from "@/components/ChatDrawer";
import { Navbar } from "@/components/Navbar";
import { SummaryCard } from "@/components/SummaryCard";
import { API_BASE, parseApiError, formatNetworkError } from "@/lib/api";

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 20;

type ChatAction = { type: "add"; payload: Message } | { type: "reset" };

type UploadResponse = {
  job_id: string;
  doc_id: string;
  status: string;
};

type JobStatusResponse = {
  status: string;
  error?: string | null;
};

type DocumentResponse = {
  file_name?: string;
  summary?: string | null;
  summary_detailed?: string | null;
  key_points?: string[] | null;
  status?: string;
  error?: string | null;
  precomputed_qa?: Array<{
    question?: string;
    answer?: string;
  }> | null;
};

type ChatResponse = {
  answer: string;
};

type PrecomputedQA = {
  question: string;
  answer: string;
};

function toBulletedText(points: string[]): string {
  return points
    .map((point) => point.trim())
    .filter((point) => point.length > 0)
    .slice(0, 8)
    .map((point) => `- ${point}`)
    .join("\n");
}

function messageReducer(state: Message[], action: ChatAction): Message[] {
  if (action.type === "add") return [...state, action.payload];
  return [];
}

const nextMessage = (role: "user" | "assistant", text: string): Message => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  text,
});

export default function ChatPage() {
  const router = useRouter();
  const params = useParams<{ docId: string }>();
  const searchParams = useSearchParams();
  const docId = params.docId;

  const [activeDocName, setActiveDocName] = useState(searchParams.get("name") ?? "Document");
  const [summary, setSummary] = useState("");
  const [precomputedQuestions, setPrecomputedQuestions] = useState<PrecomputedQA[]>([]);
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [isReplacing, setIsReplacing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [messages, dispatchMessages] = useReducer(messageReducer, []);

  useEffect(() => {
    const loadDocument = async () => {
      setIsLoadingDoc(true);
      setErrorMessage("");
      try {
        const response = await fetch(`${API_BASE}/docs/${docId}`);
        if (!response.ok) {
          throw new Error(await parseApiError(response, "Failed to load document"));
        }
        const document = (await response.json()) as DocumentResponse;
        if (document.status && document.status !== "completed") {
          const errDetail = document.error || `Document not ready (status=${document.status}).`;
          throw new Error(errDetail);
        }
        const keyPointsText = toBulletedText(document.key_points ?? []);
        const computedSummary =
          keyPointsText ||
          document.summary?.trim() ||
          document.summary_detailed?.trim() ||
          "Document loaded. Ask a question in chat to explore details.";
        const sanitizedPrecomputed = (document.precomputed_qa ?? [])
          .map((entry) => ({
            question: (entry.question ?? "").trim(),
            answer: (entry.answer ?? "").trim(),
          }))
          .filter((entry) => entry.question.length > 0);

        setActiveDocName(document.file_name || activeDocName || "Document");
        setSummary(computedSummary);
        setPrecomputedQuestions(sanitizedPrecomputed);
        dispatchMessages({ type: "reset" });
        setIsDrawerOpen(sanitizedPrecomputed.length > 0);
      } catch (error: unknown) {
        const message = formatNetworkError(error, "Failed to load document.");
        setErrorMessage(message);
      } finally {
        setIsLoadingDoc(false);
      }
    };

    if (docId) {
      void loadDocument();
    }
  }, [docId]);

  const requestChatAnswer = async (input: string) => {
    const response = await fetch(`${API_BASE}/docs/${docId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input, top_k: 5 }),
    });
    if (!response.ok) {
      throw new Error(await parseApiError(response, "Chat request failed"));
    }
    const payload = (await response.json()) as ChatResponse;
    dispatchMessages({
      type: "add",
      payload: nextMessage("assistant", payload.answer || "No answer was returned."),
    });
  };

  const handleSendMessage = async (input: string) => {
    dispatchMessages({ type: "add", payload: nextMessage("user", input) });
    try {
      await requestChatAnswer(input);
    } catch (error: unknown) {
      const message = formatNetworkError(error, "Chat request failed");
      dispatchMessages({
        type: "add",
        payload: nextMessage("assistant", `I couldn't answer that just now: ${message}`),
      });
    }
  };

  const handlePrecomputedQuestionClick = async (qa: PrecomputedQA) => {
    dispatchMessages({ type: "add", payload: nextMessage("user", qa.question) });
    setIsDrawerOpen(true);
    if (qa.answer) {
      dispatchMessages({ type: "add", payload: nextMessage("assistant", qa.answer) });
      return;
    }
    try {
      await requestChatAnswer(qa.question);
    } catch (error: unknown) {
      const message = formatNetworkError(error, "Chat request failed");
      dispatchMessages({
        type: "add",
        payload: nextMessage("assistant", `I couldn't answer that just now: ${message}`),
      });
    }
  };

  const uploadReplacementDocument = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const uploadResponse = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      body: formData,
    });
    if (!uploadResponse.ok) {
      throw new Error(await parseApiError(uploadResponse, "Upload failed"));
    }
    const upload = (await uploadResponse.json()) as UploadResponse;
    let currentStatus = upload.status;
    let attempts = 0;

    while (attempts < MAX_POLL_ATTEMPTS && currentStatus !== "completed" && currentStatus !== "failed") {
      attempts += 1;
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
      const statusResponse = await fetch(`${API_BASE}/jobs/${upload.job_id}/status`);
      if (!statusResponse.ok) {
        throw new Error(await parseApiError(statusResponse, "Failed to check job status"));
      }
      const statusPayload = (await statusResponse.json()) as JobStatusResponse;
      currentStatus = statusPayload.status;
      if (statusPayload.status === "failed") {
        throw new Error(statusPayload.error || "Document processing failed.");
      }
    }

    if (currentStatus !== "completed") {
      throw new Error(`Processing did not complete (status: ${currentStatus}).`);
    }
    router.push(`/chat/${encodeURIComponent(upload.doc_id)}?name=${encodeURIComponent(file.name)}`);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <Navbar />
      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <section className="flex flex-col flex-1 justify-center relative">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="group mx-auto flex w-full max-w-2xl items-center justify-between rounded-2xl border border-brand-500/35 bg-surface px-4 py-3 text-sm text-brand-600 shadow-[0_8px_24px_rgba(59,130,246,0.15)]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-2 w-2 shrink-0 rounded-full bg-brand-500 animate-pulse" />
              <span className="truncate font-medium text-foreground">{activeDocName}</span>
            </div>
            <div className="ml-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <label
                htmlFor="replace-document-input"
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-surface-2 text-muted-foreground hover:text-foreground"
                title="Upload another document"
              >
                <Plus className="h-4 w-4" />
              </label>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface-2 text-muted-foreground hover:text-foreground"
                title="Remove document"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>

          <div className="mx-auto mt-6 w-full max-w-2xl">
            <SummaryCard
              title="Executive Summary"
              content={
                errorMessage
                  ? errorMessage
                  : summary || "Loading document summary..."
              }
              isLoading={isLoadingDoc || isReplacing}
            />
          </div>

          {errorMessage ? (
            <div className="mx-auto mt-4 w-full max-w-2xl rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-500">
              {errorMessage}
              <button
                type="button"
                onClick={() => router.push("/")}
                className="ml-2 underline underline-offset-2"
              >
                Go back to upload
              </button>
            </div>
          ) : null}
        </section>
      </main>

      <input
        id="replace-document-input"
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setIsReplacing(true);
          setErrorMessage("");
          void uploadReplacementDocument(file)
            .catch((error: unknown) => {
              const message = error instanceof Error ? error.message : "Upload failed";
              setErrorMessage(message);
            })
            .finally(() => {
              setIsReplacing(false);
              event.currentTarget.value = "";
            });
        }}
      />

      <ChatDrawer
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        messages={messages}
        onSendMessage={handleSendMessage}
        suggestedQuestions={precomputedQuestions.map((qa) => qa.question)}
        onSuggestedQuestionClick={(question) => {
          const qa = precomputedQuestions.find((item) => item.question === question);
          if (qa) {
            void handlePrecomputedQuestionClick(qa);
          } else {
            void handleSendMessage(question);
          }
        }}
      />
    </div>
  );
}
