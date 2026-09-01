"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, CheckCircle2, FileText, AlertCircle, RefreshCw } from "lucide-react";

type UploadBoxProps = {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  isUploading: boolean;
  hasError?: boolean;
  onReset?: () => void;
};

const ACCEPTED_TYPES =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function UploadBox({
  onFileSelect,
  selectedFile,
  isUploading,
  hasError = false,
  onReset,
}: UploadBoxProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file?: File) => {
    if (!file) return;
    const validType =
      file.type === "application/pdf" ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const lowerName = file.name.toLowerCase();
    const validExtension = lowerName.endsWith(".pdf") || lowerName.endsWith(".docx");
    if (!validType && !validExtension) return;
    onFileSelect(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
    if (event.target) {
      event.target.value = "";
    }
  };

  const handleClick = () => {
    if (hasError && onReset) {
      onReset();
    }
    inputRef.current?.click();
  };

  return (
    <section className="w-full max-w-2xl relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <motion.div
          role="button"
          tabIndex={0}
          aria-label="Drag and drop upload area"
          onDragOver={(event) => {
            event.preventDefault();
            if (!isDragging) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={handleClick}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleClick();
            }
          }}
          whileHover={!selectedFile || hasError ? { scale: 1.01 } : {}}
          whileTap={!selectedFile || hasError ? { scale: 0.99 } : {}}
          className={`relative group overflow-hidden rounded-[2rem] border-2 border-dashed bg-surface/40 p-12 text-center backdrop-blur-xl transition-all duration-300 ${
            isDragging
              ? "border-brand-500 bg-brand-500/5 shadow-lg shadow-brand-500/10"
              : hasError
              ? "border-red-500/40 bg-red-500/5 hover:border-red-500/60 shadow-sm cursor-pointer"
              : selectedFile
              ? "border-transparent bg-surface shadow-sm"
              : "border-border/60 hover:border-brand-400/50 hover:bg-surface/80"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={onInputChange}
            className="hidden"
            aria-label="Upload PDF or DOCX file"
            disabled={isUploading}
          />

          <AnimatePresence mode="wait">
            {!selectedFile ? (
              <motion.div
                key="upload"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center relative z-10 pointer-events-none"
              >
                <div
                  className={`mb-6 flex h-20 w-20 items-center justify-center rounded-[1.5rem] transition-colors duration-300 ${
                    isDragging
                      ? "bg-brand-500 text-white"
                      : "bg-surface-2 text-muted-foreground group-hover:bg-brand-500/10 group-hover:text-brand-500"
                  }`}
                >
                  <UploadCloud className="h-8 w-8 transition-transform duration-300 group-hover:-translate-y-1" />
                </div>
                <h2 className="mb-2 text-xl font-semibold tracking-tight text-foreground">
                  {isDragging ? "Drop your file here" : "Click or drag to upload"}
                </h2>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">PDF or DOCX</p>
              </motion.div>
            ) : (
              <motion.div
                key="loading-or-done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center relative z-10"
              >
                <div
                  className={`mb-6 flex h-20 w-20 items-center justify-center rounded-[1.5rem] ring-1 ${
                    hasError
                      ? "bg-red-500/10 ring-red-500/30"
                      : "bg-surface-2 ring-border/50"
                  }`}
                >
                  {isUploading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                      className="relative h-8 w-8 text-brand-500"
                    >
                      <svg viewBox="0 0 24 24" fill="none" className="h-full w-full stroke-current stroke-[2.5]">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                        <path d="M12 2v10" strokeLinecap="round" />
                      </svg>
                    </motion.div>
                  ) : hasError ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", bounce: 0.5 }}
                    >
                      <AlertCircle className="h-10 w-10 text-red-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", bounce: 0.5 }}
                    >
                      <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                    </motion.div>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <h2 className="max-w-xs truncate text-lg font-semibold text-foreground">
                    {selectedFile.name}
                  </h2>
                </div>
                <p className="text-sm font-medium">
                  {isUploading ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <span className="animate-pulse">Processing document</span>
                      <span className="flex gap-0.5">
                        <span className="animate-[bounce_1.4s_infinite] inline-block">.</span>
                        <span className="animate-[bounce_1.4s_0.2s_infinite] inline-block">.</span>
                        <span className="animate-[bounce_1.4s_0.4s_infinite] inline-block">.</span>
                      </span>
                    </span>
                  ) : hasError ? (
                    <span className="inline-flex items-center gap-1.5 text-red-500 font-semibold">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Processing failed — click to retry with another file
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400">Ready to assist</span>
                  )}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </section>
  );
}

