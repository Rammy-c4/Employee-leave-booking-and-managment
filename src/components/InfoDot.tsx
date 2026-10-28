import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";

interface InfoDotProps {
  text: string;
}

export function InfoDot({ text }: InfoDotProps) {
  const [hovered, setHovered] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const updatePosition = () => {
    if (triggerRef.current?.parentElement) {
      const parent = triggerRef.current.parentElement;
      const rect = parent.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left + rect.width / 2,
      });
    }
  };

  const handleMouseEnter = () => {
    updatePosition();
    setHovered(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
  };

  useEffect(() => {
    const parent = triggerRef.current?.parentElement;
    if (!parent) return;

    // Apply interactive design styles to indicate explainability (dotted underline + help cursor)
    parent.style.cursor = "help";
    parent.style.borderBottom = "1px dotted rgba(79, 70, 229, 0.4)";  // indigo-600
    
    parent.addEventListener("mouseenter", handleMouseEnter);
    parent.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      parent.removeEventListener("mouseenter", handleMouseEnter);
      parent.removeEventListener("mouseleave", handleMouseLeave);
      if (parent) {
        parent.style.cursor = "";
        parent.style.borderBottom = "";
      }
    };
  }, []);

  useEffect(() => {
    if (hovered) {
      updatePosition();
      // Track scrolling and resizing to keep the fixed tooltip exactly in position
      window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
      window.addEventListener("resize", updatePosition);
    }

    return () => {
      window.removeEventListener("scroll", updatePosition, { capture: true });
      window.removeEventListener("resize", updatePosition);
    };
  }, [hovered]);

  const bgStyle = "bg-white/95 border-indigo-600/30 text-slate-900 shadow-[0_10px_35px_-8px_rgba(0,0,0,0.15)] backdrop-blur-md";
  const arrowColorStyle = "border-t-white/95";
  const headerIndicatorStyle = "text-indigo-700 border-indigo-600/25 bg-indigo-600/5";

  return (
    <>
      <span ref={triggerRef} className="hidden" aria-hidden="true" />
      <AnimatePresence>
        {hovered && createPortal(
          <motion.span
            initial={{ opacity: 0, scale: 0.96, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform: "translate(-50%, -100%)",
              marginTop: "-8px",
              pointerEvents: "none",
            }}
            className={`w-64 p-3.5 border text-[11px] font-sans leading-normal rounded-xl z-[99999999] pointer-events-none block ${bgStyle}`}
          >
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-mono tracking-wider uppercase mb-2 border ${headerIndicatorStyle}`}>
              <span>💡 EXPLAINER</span>
            </span>
            <div className="font-sans text-[11px] leading-relaxed font-normal">
              {text}
            </div>
            {/* Soft border indicator tip */}
            <span className={`absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent ${arrowColorStyle} block`} />
          </motion.span>,
          document.body
        )}
      </AnimatePresence>
    </>
  );
}
