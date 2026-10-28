import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  isDarkMode?: boolean;
  key?: string | number;
}

export default function Tooltip({ text, children, position = "top", isDarkMode = false }: TooltipProps) {
  const [hovered, setHovered] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      
      let targetTop = 0;
      let targetLeft = 0;

      if (position === "top") {
        targetTop = rect.top;
        targetLeft = rect.left + rect.width / 2;
      } else if (position === "bottom") {
        targetTop = rect.bottom;
        targetLeft = rect.left + rect.width / 2;
      } else if (position === "left") {
        targetTop = rect.top + rect.height / 2;
        targetLeft = rect.left;
      } else if (position === "right") {
        targetTop = rect.top + rect.height / 2;
        targetLeft = rect.right;
      }

      setCoords({ top: targetTop, left: targetLeft });
    }
  };

  const handleMouseEnter = () => {
    updatePosition();
    setHovered(true);
  };

  useEffect(() => {
    if (hovered) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
      window.addEventListener("resize", updatePosition);
    }

    return () => {
      window.removeEventListener("scroll", updatePosition, { capture: true });
      window.removeEventListener("resize", updatePosition);
    };
  }, [hovered, position]);

  // Transform strategy
  let transformValue = "translate(-50%, -100%)";
  let marginClass = "mb-2.5";
  let arrowClass = "top-full left-1/2 -translate-x-1/2";
  let arrowColor = isDarkMode ? "border-t-slate-950" : "border-t-white";

  if (position === "bottom") {
    transformValue = "translate(-50%, 0%)";
    marginClass = "mt-2.5";
    arrowClass = "bottom-full left-1/2 -translate-x-1/2";
    arrowColor = isDarkMode ? "border-b-slate-950" : "border-b-white";
  } else if (position === "left") {
    transformValue = "translate(-100%, -50%)";
    marginClass = "mr-2.5";
    arrowClass = "left-full top-1/2 -translate-y-1/2";
    arrowColor = isDarkMode ? "border-l-slate-950" : "border-l-white";
  } else if (position === "right") {
    transformValue = "translate(0%, -50%)";
    marginClass = "ml-2.5";
    arrowClass = "right-full top-1/2 -translate-y-1/2";
    arrowColor = isDarkMode ? "border-r-slate-950" : "border-r-white";
  }

  // Custom styling colors based on current mode
  const bgStyle = isDarkMode
    ? "bg-slate-950 border-slate-700 text-slate-100 shadow-2xl"
    : "bg-white border-slate-400 text-slate-900 shadow-xl";

  return (
    <div
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
      onFocus={handleMouseEnter}
      onBlur={() => setHovered(false)}
    >
      {children}
      <AnimatePresence>
        {hovered && createPortal(
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: position === "top" ? 5 : -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform: transformValue,
              pointerEvents: "none"
            }}
            className={`fixed ${marginClass} w-64 p-3 border rounded-xl font-medium text-xs leading-relaxed z-[9999999] pointer-events-none text-center ${bgStyle}`}
          >
            {text}
            {/* Soft pointer arrow */}
            <span className={`absolute border-8 border-transparent ${arrowClass} ${arrowColor} block`} />
          </motion.div>,
          document.body
        )}
      </AnimatePresence>
    </div>
  );
}
