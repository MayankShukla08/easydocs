"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { SummaryCard } from "@/components/SummaryCard";
import { UploadBox } from "@/components/UploadBox";
import { API_BASE } from "@/lib/api";

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 20;

type UploadResponse = {
  job_id: string;
  doc_id: string;
  status: string;
};

type JobStatusResponse = {
  status: string;
};

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") return data.detail;
  } catch {
    // Ignore parsing errors and fall back to status text.
  }
  return response.statusText || "Request failed";
}

export default function Home() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [summary, setSummary] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleFileUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const uploadResponse = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      body: formData,
    });
    if (!uploadResponse.ok) {
      throw new Error(await readErrorDetail(uploadResponse));
    }
    const upload = (await uploadResponse.json()) as UploadResponse;

    let currentStatus = upload.status;
    let attempts = 0;
    while (attempts < MAX_POLL_ATTEMPTS && currentStatus !== "completed" && currentStatus !== "failed") {
      attempts += 1;
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
      const statusResponse = await fetch(`${API_BASE}/jobs/${upload.job_id}/status`);
      if (!statusResponse.ok) {
        throw new Error(await readErrorDetail(statusResponse));
      }
      const statusPayload = (await statusResponse.json()) as JobStatusResponse;
      currentStatus = statusPayload.status;
    }

    if (currentStatus !== "completed") {
      throw new Error(`Processing did not complete (status: ${currentStatus}).`);
    }
    router.push(`/chat/${encodeURIComponent(upload.doc_id)}?name=${encodeURIComponent(file.name)}`);
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setIsUploading(true);
    setSummary("");
    setErrorMessage("");
    void handleFileUpload(file)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Upload failed";
        setErrorMessage(message);
      })
      .finally(() => {
        setIsUploading(false);
      });
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground selection:bg-brand-500/30 font-sans">
      <Navbar />

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-4 pb-24 pt-12 sm:px-6 lg:px-8">
        
        {/* Animated Header */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="text-center mb-12 sm:mb-16 w-full"
        >
          <motion.div
             initial={{ scale: 0.95, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             transition={{ delay: 0.1, duration: 0.4 }}
             className="mx-auto mb-6 inline-flex w-fit items-center gap-2.5 rounded-full border border-border/80 bg-surface/50 px-3.5 py-1.5 text-xs font-semibold text-foreground backdrop-blur-md"
          >
             <span className="relative flex h-2 w-2 items-center justify-center">
               <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75"></span>
               <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500"></span>
             </span>
             Powered by Advanced AI
          </motion.div>
          <h1 className="mb-5 text-4xl font-black tracking-tight text-foreground sm:text-5xl md:text-6xl max-w-3xl mx-auto leading-tight">
            Knowledge unlocked <br className="hidden sm:block" /> in seconds.
          </h1>
          <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg">
            Upload your PDF or Word document and let our intelligent engine effortlessly summarize and answer all your questions.
          </p>
        </motion.div>

        <section className="w-full flex-1 relative flex flex-col items-center">
          <UploadBox onFileSelect={handleFileSelect} selectedFile={selectedFile} isUploading={isUploading} />

          <AnimatePresence>
            {(selectedFile || isUploading || errorMessage) && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="mt-8 w-full max-w-2xl"
              >
                <SummaryCard
                  title={errorMessage ? "Error" : isUploading ? "Analyzing Document" : "Processing Complete"}
                  content={
                    errorMessage
                      ? errorMessage
                      : isUploading
                      ? "We are parsing and indexing your document's contents. You will be automatically redirected to chat shortly."
                      : summary || "Redirecting..."
                  }
                  isLoading={isUploading}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
