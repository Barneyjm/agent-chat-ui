"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MarkdownText } from "./markdown-text";
import { cn } from "@/lib/utils";

/**
 * Configuration for animated text display
 * Adjust these values to control the reading experience
 */
export const ANIMATION_CONFIG = {
  /** Characters revealed per second (default: 150 = comfortable reading speed) */
  charsPerSecond: 150,
  /** Whether animation is enabled globally */
  enabled: true,
  /** Minimum characters to reveal per frame to avoid choppy animation */
  minCharsPerFrame: 1,
  /** Whether to show sparkle effects */
  sparklesEnabled: true,
  /** Maximum number of sparkle particles */
  maxSparkles: 8,
} as const;

/**
 * Individual sparkle/snowflake particle
 */
interface Sparkle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  type: "sparkle" | "snow";
}

/**
 * Hook that animates text reveal at a controlled reading speed.
 *
 * Inspired by Upstash's smooth streaming approach:
 * - Receives text chunks as fast as possible
 * - Reveals text at a consistent, readable pace
 *
 * @param targetText - The full text to animate towards
 * @param isStreaming - Whether new content is actively streaming in
 * @param options - Animation configuration overrides
 */
export function useAnimatedText(
  targetText: string,
  isStreaming: boolean,
  options: {
    charsPerSecond?: number;
    enabled?: boolean;
  } = {}
) {
  const {
    charsPerSecond = ANIMATION_CONFIG.charsPerSecond,
    enabled = ANIMATION_CONFIG.enabled,
  } = options;

  // The text currently being displayed
  const [displayedText, setDisplayedText] = useState("");

  // Track animation state
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const displayedLengthRef = useRef<number>(0);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Reset displayed text when target text changes dramatically (new message)
  useEffect(() => {
    // If target is empty or much shorter, reset
    if (targetText.length === 0 || targetText.length < displayedLengthRef.current - 10) {
      setDisplayedText("");
      displayedLengthRef.current = 0;
    }
  }, [targetText]);

  // Animation loop
  const animate = useCallback(
    (timestamp: number) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastFrameTimeRef.current;
      const currentDisplayed = displayedLengthRef.current;
      const targetLength = targetText.length;

      // If we've caught up, stop animating
      if (currentDisplayed >= targetLength) {
        if (!isStreaming) {
          // Streaming done and caught up - stop animation
          animationRef.current = null;
          return;
        }
        // Still streaming but caught up - continue polling
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // Calculate how many characters to reveal based on elapsed time
      const charsToReveal = Math.max(
        ANIMATION_CONFIG.minCharsPerFrame,
        Math.floor((elapsed / 1000) * charsPerSecond)
      );

      if (charsToReveal > 0) {
        const newLength = Math.min(currentDisplayed + charsToReveal, targetLength);
        displayedLengthRef.current = newLength;
        setDisplayedText(targetText.slice(0, newLength));
        lastFrameTimeRef.current = timestamp;
      }

      // Continue animation
      animationRef.current = requestAnimationFrame(animate);
    },
    [targetText, isStreaming, charsPerSecond]
  );

  // Start/manage animation
  useEffect(() => {
    if (!enabled) {
      // Animation disabled - show full text immediately
      setDisplayedText(targetText);
      displayedLengthRef.current = targetText.length;
      return;
    }

    const shouldAnimate =
      displayedLengthRef.current < targetText.length || isStreaming;

    if (shouldAnimate && !animationRef.current) {
      lastFrameTimeRef.current = 0;
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      // Don't cancel animation on every effect run, only on unmount
    };
  }, [targetText, isStreaming, enabled, animate]);

  // When streaming stops, ensure we eventually show all text
  useEffect(() => {
    if (!isStreaming && displayedLengthRef.current < targetText.length) {
      // Give animation a moment to catch up, then force complete
      const timeout = setTimeout(() => {
        if (displayedLengthRef.current < targetText.length) {
          setDisplayedText(targetText);
          displayedLengthRef.current = targetText.length;
        }
      }, 2000); // Max 2 seconds to finish revealing after stream ends

      return () => clearTimeout(timeout);
    }
  }, [isStreaming, targetText]);

  return {
    displayedText,
    isAnimating: displayedLengthRef.current < targetText.length,
    progress: targetText.length > 0
      ? displayedLengthRef.current / targetText.length
      : 1,
  };
}

/**
 * Hook to generate sparkle particles
 */
function useSparkles(isAnimating: boolean, enabled: boolean) {
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const idCounterRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || !isAnimating) {
      // Clear sparkles when not animating
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Fade out existing sparkles
      const timeout = setTimeout(() => setSparkles([]), 1000);
      return () => clearTimeout(timeout);
    }

    // Generate new sparkles periodically
    intervalRef.current = setInterval(() => {
      const newSparkle: Sparkle = {
        id: idCounterRef.current++,
        x: 85 + Math.random() * 15, // Appear near the right side (where text is being revealed)
        y: Math.random() * 100,
        size: 4 + Math.random() * 8,
        duration: 1000 + Math.random() * 1000,
        delay: Math.random() * 200,
        type: Math.random() > 0.5 ? "sparkle" : "snow",
      };

      setSparkles((prev) => {
        const updated = [...prev, newSparkle].slice(-ANIMATION_CONFIG.maxSparkles);
        return updated;
      });

      // Remove sparkle after animation completes
      setTimeout(() => {
        setSparkles((prev) => prev.filter((s) => s.id !== newSparkle.id));
      }, newSparkle.duration + newSparkle.delay + 100);
    }, 150);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isAnimating, enabled]);

  return sparkles;
}

/**
 * Sparkle particle component
 */
function SparkleParticle({ sparkle }: { sparkle: Sparkle }) {
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${sparkle.x}%`,
    top: `${sparkle.y}%`,
    width: sparkle.size,
    height: sparkle.size,
    pointerEvents: "none",
    animation: `${sparkle.type === "snow" ? "snowfall" : "sparkle"} ${sparkle.duration}ms ease-out ${sparkle.delay}ms forwards`,
    opacity: 0,
  };

  if (sparkle.type === "snow") {
    return (
      <span style={style} className="text-white drop-shadow-[0_0_2px_rgba(255,255,255,0.8)]">
        ❄
      </span>
    );
  }

  return (
    <span style={style} className="text-yellow-200 drop-shadow-[0_0_4px_rgba(255,215,0,0.8)]">
      ✦
    </span>
  );
}

/**
 * CSS keyframes for sparkle animations (injected once)
 */
function SparkleStyles() {
  return (
    <style jsx global>{`
      @keyframes sparkle {
        0% {
          opacity: 0;
          transform: scale(0) rotate(0deg);
        }
        20% {
          opacity: 1;
          transform: scale(1) rotate(45deg);
        }
        100% {
          opacity: 0;
          transform: scale(0.5) rotate(90deg) translateY(-20px);
        }
      }

      @keyframes snowfall {
        0% {
          opacity: 0;
          transform: translateY(0) rotate(0deg) scale(0.5);
        }
        20% {
          opacity: 0.9;
          transform: translateY(-5px) rotate(45deg) scale(1);
        }
        100% {
          opacity: 0;
          transform: translateY(-30px) rotate(180deg) scale(0.3);
        }
      }

      @keyframes shimmer {
        0% {
          background-position: -200% center;
        }
        100% {
          background-position: 200% center;
        }
      }

      .animate-shimmer {
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.1) 50%,
          transparent 100%
        );
        background-size: 200% 100%;
        animation: shimmer 2s ease-in-out infinite;
      }
    `}</style>
  );
}

/**
 * AnimatedText component - wraps MarkdownText with smooth text reveal
 * and magical holiday sparkle effects
 *
 * Usage:
 * ```tsx
 * <AnimatedText isStreaming={isLoading}>
 *   {contentString}
 * </AnimatedText>
 * ```
 *
 * To disable animation and show text immediately, set enabled={false}
 */
export function AnimatedText({
  children,
  isStreaming,
  enabled = ANIMATION_CONFIG.enabled,
  charsPerSecond = ANIMATION_CONFIG.charsPerSecond,
  sparklesEnabled = ANIMATION_CONFIG.sparklesEnabled,
}: {
  children: string;
  isStreaming: boolean;
  enabled?: boolean;
  charsPerSecond?: number;
  sparklesEnabled?: boolean;
}) {
  const { displayedText, isAnimating } = useAnimatedText(children, isStreaming, {
    enabled,
    charsPerSecond,
  });

  const sparkles = useSparkles(isAnimating, sparklesEnabled);

  // Don't render empty content
  if (!displayedText) {
    return null;
  }

  return (
    <div className="relative">
      <SparkleStyles />

      {/* Sparkle particles */}
      {sparklesEnabled && sparkles.length > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {sparkles.map((sparkle) => (
            <SparkleParticle key={sparkle.id} sparkle={sparkle} />
          ))}
        </div>
      )}

      {/* Text content with optional shimmer effect while animating */}
      <div className={cn(isAnimating && sparklesEnabled && "animate-shimmer rounded")}>
        <MarkdownText>{displayedText}</MarkdownText>
      </div>
    </div>
  );
}

/**
 * Re-export MarkdownText for easy swap-out
 * If animation doesn't work out, just change imports from
 * AnimatedText to MarkdownText
 */
export { MarkdownText } from "./markdown-text";
