"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Loader2, MessageSquare, RefreshCw, ChevronRight, Clock, AlertTriangle } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { API_BASE, parseApiError, formatNetworkError } from "@/lib/api";

type DocumentItem = {
  doc_id: string;
  file_name: string;
  status: string;
  error?: string | null;
  summary?: string | null;
  created_at?: string;
  updated_at?: string;
};

function formatDate(value?: string): string {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoveredDoc, setHoveredDoc] = useState<string | null>(null);

  const loadDocuments = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/docs`);
      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to load documents"));
      }
      const payload = (await response.json()) as DocumentItem[];
      setDocuments(payload);
    } catch (err: unknown) {
      setError(formatNetworkError(err, "Failed to load documents."));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDocuments();
  }, []);

  const completedCount = useMemo(
    () => documents.filter((doc) => doc.status === "completed").length,
    [documents]
  );

  return (
    <div className="relative min-h-screen bg-background text-foreground selection:bg-brand-500/30">
      <Navbar />
      <main className="relative z-10 mx-auto w-full max-w-4xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mb-10 flex items-end justify-between border-b border-border/50 pb-6"
        >
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Library</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {documents.length} documents indexed &middot; {completedCount} ready for chat
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => void loadDocuments()}
            className="group flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface hover:shadow-sm"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground transition-transform duration-500 group-hover:rotate-180 group-hover:text-foreground" />
            Refresh
          </motion.button>
        </motion.div>

        {isLoading ? (
          <div className="flex h-64 flex-col items-center justify-center space-y-4">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
            <p className="text-sm font-medium text-muted-foreground">Syncing documents...</p>
          </div>
        ) : error ? (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm font-medium text-red-500"
          >
            {error}
          </motion.div>
        ) : documents.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 p-16 text-center"
          >
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 ring-1 ring-border/50">
               <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">Your library is empty</h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Upload a document to start extracting intelligence and asking questions.
            </p>
            <Link
              href="/"
              className="inline-flex rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-transform hover:scale-105 active:scale-95"
            >
              Upload Document
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {documents.map((doc, i) => (
                <motion.div
                  key={doc.doc_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                  onHoverStart={() => setHoveredDoc(doc.doc_id)}
                  onHoverEnd={() => setHoveredDoc(null)}
                  className="group relative flex items-center justify-between overflow-hidden rounded-2xl border border-transparent bg-transparent px-4 py-4 transition-all hover:border-border/60 hover:bg-surface hover:shadow-sm sm:px-6"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                      doc.status === "completed" ? "bg-brand-500/10 text-brand-500" :
                      doc.status === "failed" ? "bg-red-500/10 text-red-500" :
                      "bg-amber-500/10 text-amber-500"
                    }`}>
                      {doc.status === "completed" ? <FileText className="h-4 w-4" /> :
                       doc.status === "failed" ? <FileText className="h-4 w-4 opacity-50" /> :
                       <RefreshCw className="h-4 w-4 animate-spin" />}
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        {doc.status === "completed" ? (
                          <Link 
                             href={`/chat/${encodeURIComponent(doc.doc_id)}?name=${encodeURIComponent(doc.file_name)}`}
                             className="truncate text-base font-medium text-foreground hover:text-brand-600 transition-colors"
                          >
                             {doc.file_name}
                          </Link>
                        ) : (
                          <span className="truncate text-base font-medium text-foreground">
                            {doc.file_name}
                          </span>
                        )}
                        {doc.status !== "completed" && (
                          <span className={`shrink-0 rounded-full py-0.5 px-2 text-[10px] font-medium uppercase tracking-wider ${
                            doc.status === "failed" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"
                          }`}>
                            {doc.status}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                           <Clock className="h-3 w-3" />
                           {formatDate(doc.created_at)}
                        </span>
                        {doc.status === "failed" && doc.error ? (
                          <span className="truncate max-w-[200px] sm:max-w-xs md:max-w-md inline-block border-l border-red-500/30 pl-4 text-red-400">
                            {doc.error}
                          </span>
                        ) : doc.summary ? (
                          <span className="truncate max-w-[200px] sm:max-w-xs md:max-w-md hidden sm:inline-block border-l border-border/50 pl-4">
                            {doc.summary}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {(hoveredDoc === doc.doc_id || window.innerWidth < 768) && doc.status === "completed" && (
                      <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="ml-4 shrink-0 flex items-center gap-2"
                      >
                        <Link
                          href={`/chat/${encodeURIComponent(doc.doc_id)}?name=${encodeURIComponent(doc.file_name)}`}
                          className="flex items-center justify-center gap-2 rounded-full border border-border/60 bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-brand-500/40 hover:bg-brand-500/5 hover:text-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          <MessageSquare className="h-4 w-4" />
                          <span className="hidden sm:inline">Chat</span>
                          <ChevronRight className="h-4 w-4 sm:hidden" />
                        </Link>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
