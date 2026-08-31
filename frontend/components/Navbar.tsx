"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Home, Moon, Settings, Sun } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const navLinks = [
  { name: "Home", href: "/", icon: Home },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Settings", href: "#", icon: Settings },
];

export function Navbar() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("theme");
    const shouldUseDark = savedTheme ? savedTheme === "dark" : false;
    document.documentElement.dataset.theme = shouldUseDark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", shouldUseDark);
    setIsDark(shouldUseDark);
    setMounted(true);
  }, []);

  const handleThemeToggle = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", nextDark);
    window.localStorage.setItem("theme", nextDark ? "dark" : "light");
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 z-40 w-full border-b border-border/40 bg-surface/80 backdrop-blur-md"
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center transition-opacity hover:opacity-80">
          <Image
            src="/EasyDocs.png"
            alt="EasyDocs"
            width={0}
            height={0}
            sizes="(max-width: 768px) 108px, 136px"
            className="w-[108px] sm:w-[136px] h-auto max-h-12 object-contain"
            priority
          />
        </Link>

        <nav className="hidden items-center md:flex">
          <ul className="flex items-center gap-1">
            {navLinks.map((link) => (
              <li key={link.name}>
                <Link
                  href={link.href}
                  className={`relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? "text-foreground"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <link.icon className="h-4 w-4" />
                  {link.name}
                  {pathname === link.href && (
                     <motion.div 
                       layoutId="nav-pill"
                       className="absolute inset-0 rounded-md bg-surface-2 -z-10"
                       transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                     />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={handleThemeToggle}
            aria-label={isDark ? "Switch to day mode" : "Switch to night mode"}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
          >
            <AnimatePresence mode="wait" initial={false}>
              {mounted && (
                 <motion.div
                   key={isDark ? "dark" : "light"}
                   initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
                   animate={{ opacity: 1, rotate: 0, scale: 1 }}
                   exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
                   transition={{ duration: 0.2 }}
                 >
                   {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                 </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
    </motion.header>
  );
}

