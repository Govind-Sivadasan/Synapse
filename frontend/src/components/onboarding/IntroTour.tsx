import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface TourStep {
  id: string;
  title: string;
  body: string;
  target: string;
  fallback?: string;
  placement?: "right" | "bottom" | "top" | "left";
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "nav",
    title: "Navigation",
    body: "Use the sidebar to move between dashboard, routing monitor, migration jobs, configuration, and reports.",
    target: '[data-tour="sidebar-nav"]',
    placement: "right",
  },
  {
    id: "stats",
    title: "Live metrics",
    body: "Studies routed today, success rate, active migration jobs, and DIMSE listener status update here in real time.",
    target: '[data-tour="global-stats"]',
    placement: "bottom",
  },
  {
    id: "content",
    title: "Workspace",
    body: "Page content appears here — monitors, tables, and configuration forms for your PACS environment.",
    target: '[data-tour="app-content"] .page-header',
    fallback: '[data-tour="app-content"]',
    placement: "bottom",
  },
  {
    id: "footer",
    title: "Service health",
    body: "Dependency latency and status for PostgreSQL, Redis, Orthanc, and more. Click System health for details.",
    target: '[data-tour="status-footer"]',
    placement: "top",
  },
  {
    id: "help",
    title: "Need more help?",
    body: "Replay this tour anytime from Help. Press ? for keyboard shortcuts. Customize layout under Account.",
    target: '[data-tour="sidebar-help"]',
    placement: "right",
  },
];

const PAD = 8;
const CARD_GAP = 14;
const CARD_WIDTH = 360;

function tourStorageKey(username: string) {
  return `synapse.tour.completed.${username || "default"}`;
}

export function isTourCompleted(username: string): boolean {
  return localStorage.getItem(tourStorageKey(username)) === "1";
}

export function markTourCompleted(username: string) {
  localStorage.setItem(tourStorageKey(username), "1");
}

function headerOffset(): number {
  const topbar = document.querySelector(".app-topbar");
  return topbar ? topbar.getBoundingClientRect().height : 52;
}

function resolveTarget(step: TourStep): Element | null {
  for (const selector of [step.target, step.fallback].filter(Boolean) as string[]) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function spotlightRect(el: Element): DOMRect {
  const rect = el.getBoundingClientRect();
  if (el.matches('[data-tour="app-content"]')) {
    return new DOMRect(rect.left, rect.top, rect.width, Math.min(rect.height, 100));
  }
  return rect;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function fitsViewport(top: number, left: number, cardW: number, cardH: number): boolean {
  const topMin = headerOffset() + CARD_GAP;
  return (
    top >= topMin &&
    left >= CARD_GAP &&
    left + cardW <= window.innerWidth - CARD_GAP &&
    top + cardH <= window.innerHeight - CARD_GAP
  );
}

function positionCard(
  spot: DOMRect,
  cardW: number,
  cardH: number,
  preferred: TourStep["placement"],
): { top: number; left: number } {
  const topMin = headerOffset() + CARD_GAP;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const candidates: { top: number; left: number }[] = [];

  const addRight = () =>
    candidates.push({
      top: clamp(spot.top, topMin, vh - cardH - CARD_GAP),
      left: spot.right + CARD_GAP,
    });
  const addLeft = () =>
    candidates.push({
      top: clamp(spot.top, topMin, vh - cardH - CARD_GAP),
      left: spot.left - cardW - CARD_GAP,
    });
  const addBottom = () =>
    candidates.push({
      top: spot.bottom + CARD_GAP,
      left: clamp(spot.left + spot.width / 2 - cardW / 2, CARD_GAP, vw - cardW - CARD_GAP),
    });
  const addTop = () =>
    candidates.push({
      top: spot.top - cardH - CARD_GAP,
      left: clamp(spot.left + spot.width / 2 - cardW / 2, CARD_GAP, vw - cardW - CARD_GAP),
    });

  switch (preferred) {
    case "right":
      addRight();
      addBottom();
      addTop();
      addLeft();
      break;
    case "left":
      addLeft();
      addRight();
      addBottom();
      addTop();
      break;
    case "top":
      addTop();
      addBottom();
      addRight();
      addLeft();
      break;
    case "bottom":
    default:
      addBottom();
      addTop();
      addRight();
      addLeft();
      break;
  }

  for (const pos of candidates) {
    if (fitsViewport(pos.top, pos.left, cardW, cardH)) return pos;
  }

  return {
    top: clamp((vh - cardH) / 2, topMin, vh - cardH - CARD_GAP),
    left: clamp((vw - cardW) / 2, CARD_GAP, vw - cardW - CARD_GAP),
  };
}

interface Props {
  username: string;
  run: boolean;
  onClose: () => void;
}

export default function IntroTour({ username, run, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotRect, setSpotRect] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex >= TOUR_STEPS.length - 1;

  const measureStep = useCallback(() => {
    if (!step) {
      setSpotRect(null);
      setVisible(false);
      return;
    }

    const el = resolveTarget(step);
    if (!el) {
      setSpotRect(null);
      setVisible(false);
      return;
    }

    if (step.id === "content") {
      document.querySelector(".app-content")?.scrollTo({ top: 0, behavior: "auto" });
    }

    if (step.id !== "nav" && step.id !== "help") {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }

    const rect = spotlightRect(el);
    setSpotRect(rect);
  }, [step]);

  useEffect(() => {
    if (!run) {
      setVisible(false);
      setSpotRect(null);
      return;
    }
    setStepIndex(0);
    document.querySelector(".app-content")?.scrollTo({ top: 0, behavior: "auto" });
  }, [run]);

  useLayoutEffect(() => {
    if (!run || !step) return;
    measureStep();
    const onLayoutChange = () => measureStep();
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);
    return () => {
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onLayoutChange, true);
    };
  }, [run, stepIndex, step, measureStep]);

  useLayoutEffect(() => {
    if (!run || !spotRect || !step) return;
    const card = cardRef.current;
    const cardH = card?.offsetHeight ?? 200;
    const cardW = card?.offsetWidth ?? CARD_WIDTH;
    const pos = positionCard(spotRect, cardW, cardH, step.placement);
    setCardPos(pos);
    setVisible(true);
  }, [run, spotRect, stepIndex, step]);

  const finish = useCallback(() => {
    markTourCompleted(username);
    setVisible(false);
    onClose();
  }, [username, onClose]);

  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, finish]);

  const next = () => {
    if (isLast) finish();
    else setStepIndex((i) => i + 1);
  };

  if (!run || !step) return null;

  const spotlightStyle = spotRect
    ? {
        top: spotRect.top - PAD,
        left: spotRect.left - PAD,
        width: spotRect.width + PAD * 2,
        height: spotRect.height + PAD * 2,
      }
    : undefined;

  return (
    <div className="intro-tour" role="dialog" aria-modal="false" aria-label="Product tour">
      {spotlightStyle && <div className="intro-tour-highlight" style={spotlightStyle} aria-hidden />}
      <div
        ref={cardRef}
        className={`intro-tour-card card${visible ? " intro-tour-card--visible" : ""}`}
        style={{ top: cardPos.top, left: cardPos.left, width: CARD_WIDTH }}
      >
        <div className="intro-tour-card-header">
          <strong>{step.title}</strong>
          <button type="button" className="btn-ghost btn-sm" onClick={finish} aria-label="Close tour">
            <X size={16} />
          </button>
        </div>
        <p>{step.body}</p>
        <div className="intro-tour-progress">
          Step {stepIndex + 1} of {TOUR_STEPS.length}
        </div>
        <div className="intro-tour-actions">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft size={14} />
            Back
          </button>
          <button type="button" className="btn-sm" onClick={next}>
            {isLast ? "Finish" : "Next"}
            {!isLast && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
