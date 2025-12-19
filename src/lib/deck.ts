"use client";

import { createContext, useContext } from "react";

// Types
export interface Card {
  suit: "hearts" | "diamonds" | "clubs" | "spades";
  value: string; // "A", "2"-"10", "J", "Q", "K"
}

// Constants
const SUITS = ["hearts", "diamonds", "clubs", "spades"] as const;
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const STORAGE_KEY = "northPoleQuest_deck";

// Create a fresh 52-card deck
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit: suit as Card["suit"], value });
    }
  }
  return deck;
}

// Fisher-Yates shuffle for proper randomization
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Draw cards from deck
export function drawCardsFromDeck(
  deck: Card[],
  count: number
): { drawn: Card[]; remaining: Card[]; reshuffled: boolean } {
  if (deck.length < count) {
    // Not enough cards - reshuffle and draw
    const newDeck = shuffleDeck(createDeck());
    const drawn = newDeck.splice(0, count);
    return { drawn, remaining: newDeck, reshuffled: true };
  }
  const remaining = [...deck];
  const drawn = remaining.splice(0, count);
  return { drawn, remaining, reshuffled: false };
}

// Format card for display (matches existing format: "A of hearts")
export function formatCard(card: Card): string {
  return `${card.value} of ${card.suit}`;
}

// localStorage helpers
export function saveDeck(deck: Card[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
  }
}

export function loadDeck(): Card[] {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Invalid data, return fresh deck
      }
    }
  }
  return shuffleDeck(createDeck());
}

export function resetDeck(): Card[] {
  const deck = shuffleDeck(createDeck());
  saveDeck(deck);
  return deck;
}

// Context for sharing deck state across components
export interface DeckContextType {
  deck: Card[];
  cardsRemaining: number;
  draw: (count: number) => { cards: Card[]; reshuffled: boolean };
  reset: () => void;
}

export const DeckContext = createContext<DeckContextType | null>(null);

export function useDeck() {
  const context = useContext(DeckContext);
  if (!context) {
    throw new Error("useDeck must be used within DeckProvider");
  }
  return context;
}
