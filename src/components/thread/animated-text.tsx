"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MarkdownText } from "./markdown-text";

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
} as const;

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
 * AnimatedText component - wraps MarkdownText with smooth text reveal
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
}: {
  children: string;
  isStreaming: boolean;
  enabled?: boolean;
  charsPerSecond?: number;
}) {
  const { displayedText } = useAnimatedText(children, isStreaming, {
    enabled,
    charsPerSecond,
  });

  // Don't render empty content
  if (!displayedText) {
    return null;
  }

  return <MarkdownText>{displayedText}</MarkdownText>;
}

/**
 * Re-export MarkdownText for easy swap-out
 * If animation doesn't work out, just change imports from
 * AnimatedText to MarkdownText
 */
export { MarkdownText } from "./markdown-text";
