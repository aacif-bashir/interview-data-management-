"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Library,
  FolderOpen,
  ListChecks,
  BookOpen,
  Settings,
} from "lucide-react";

export type StudyView = "folders" | "questions" | "study";

interface MobileBottomNavProps {
  studyView?: StudyView;
  onStudyViewChange?: (view: StudyView) => void;
}

const TOP_LEVEL_PAGES = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/studylibrary", label: "Library", icon: Library },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const STUDY_TABS = [
  { id: "folders" as const, label: "Folders", icon: FolderOpen },
  { id: "questions" as const, label: "Questions", icon: ListChecks },
  { id: "study" as const, label: "Study", icon: BookOpen },
] as const;

export function MobileBottomNav({
  studyView,
  onStudyViewChange,
}: MobileBottomNavProps) {
  const pathname = usePathname();
  const isLibrary = pathname === "/studylibrary" || pathname.startsWith("/studylibrary/");

  return (
    <nav
      aria-label="Mobile navigation"
      className="shrink-0 border-t border-border bg-sidebar/95 backdrop-blur-md"
    >
      {/* Page-level navigation */}
      <div className="flex items-stretch">
        {TOP_LEVEL_PAGES.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide transition-all duration-200",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={cn(
                  "relative flex items-center justify-center rounded-xl px-3 py-1 transition-all duration-200",
                  isActive ? "bg-primary/10 dark:bg-primary/20 scale-110" : "hover:bg-accent"
                )}
              >
                <Icon
                  className={cn(
                    "size-5 transition-all duration-200",
                    isActive ? "stroke-[2.5px]" : "stroke-[1.8px]"
                  )}
                />
              </span>
              {label}
            </Link>
          );
        })}
      </div>

      {/* In-page study view tabs (only on library page) */}
      {isLibrary && studyView !== undefined && onStudyViewChange && (
        <div className="flex items-center gap-1 border-t border-border/50 px-3 py-1.5">
          <span className="mr-2 shrink-0 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
            View
          </span>
          {STUDY_TABS.map(({ id, label, icon: Icon }) => {
            const active = studyView === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onStudyViewChange(id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-all duration-200",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}
