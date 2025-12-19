import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDeck, formatCard } from "@/lib/deck";

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

interface DiceRollerProps {
  numDice?: number;
  reason?: string;
  onSubmit: (values: number[], total: number) => void;
}

function DiceRoller({ numDice = 2, reason, onSubmit }: DiceRollerProps) {
  const [diceValues, setDiceValues] = useState<number[]>([]);
  const [isRolling, setIsRolling] = useState(false);
  const [hasRolled, setHasRolled] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [finalValues, setFinalValues] = useState<number[]>([]);

  const rollDice = useCallback(() => {
    setIsRolling(true);
    setHasRolled(false);
    setHasSubmitted(false);

    // Generate final values upfront
    const finalRoll = Array.from({ length: numDice }, () =>
      Math.floor(Math.random() * 6) + 1
    );
    setFinalValues(finalRoll);

    // Animate through random values
    let iterations = 0;
    const maxIterations = 10;
    const interval = setInterval(() => {
      const randomValues = Array.from({ length: numDice }, () =>
        Math.floor(Math.random() * 6) + 1
      );
      setDiceValues(randomValues);
      iterations++;

      if (iterations >= maxIterations) {
        clearInterval(interval);
        setDiceValues(finalRoll);
        setIsRolling(false);
        setHasRolled(true);
      }
    }, 80);
  }, [numDice]);

  // Auto-submit after roll completes (only once)
  useEffect(() => {
    if (hasRolled && finalValues.length > 0 && !hasSubmitted) {
      const total = finalValues.reduce((sum, val) => sum + val, 0);
      // Small delay so user can see the result
      const timer = setTimeout(() => {
        setHasSubmitted(true);
        onSubmit(finalValues, total);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasRolled, finalValues, hasSubmitted, onSubmit]);

  const total = diceValues.reduce((sum, val) => sum + val, 0);

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-xl">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🎲</span>
        <div className="flex flex-col">
          <span className="font-semibold text-gray-800">Roll the Dice!</span>
          {reason && <span className="text-sm text-gray-500">Roll 2d6 for: {reason}</span>}
        </div>
      </div>

      {/* Dice Display */}
      <div className="flex items-center justify-center gap-3">
        {(diceValues.length > 0 ? diceValues : Array(numDice).fill(null)).map(
          (value, idx) => (
            <div
              key={idx}
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-bold shadow-md transition-all",
                isRolling && "animate-bounce",
                value
                  ? "bg-gradient-to-br from-red-500 to-red-700 text-white"
                  : "bg-gray-200 text-gray-400"
              )}
            >
              {value ?? "?"}
            </div>
          )
        )}
      </div>

      {/* Total Display */}
      {hasRolled && (
        <div className="text-center">
          <span className="text-lg font-bold text-gray-700">
            Total: <span className="text-red-600">{total}</span>
          </span>
          <p className="text-xs text-gray-400 mt-1">Submitting...</p>
        </div>
      )}

      {/* Roll Button - only shown before rolling */}
      {!hasRolled && (
        <Button
          onClick={rollDice}
          disabled={isRolling}
          className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white"
        >
          {isRolling ? "Rolling..." : "Roll Dice"}
        </Button>
      )}
    </div>
  );
}

interface CardDrawerProps {
  numCards?: number;
  reason?: string;
  onSubmit: (cards: string[]) => void;
}

function CardDrawer({ numCards = 1, reason, onSubmit }: CardDrawerProps) {
  const { draw, cardsRemaining } = useDeck();
  const [drawnCards, setDrawnCards] = useState<string[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [wasReshuffled, setWasReshuffled] = useState(false);

  const drawCards = useCallback(() => {
    setIsDrawing(true);
    setHasDrawn(false);
    setHasSubmitted(false);
    setWasReshuffled(false);

    // Animate card flip
    setTimeout(() => {
      const { cards, reshuffled } = draw(numCards);
      const formatted = cards.map(formatCard);
      setDrawnCards(formatted);
      setWasReshuffled(reshuffled);
      setIsDrawing(false);
      setHasDrawn(true);
    }, 500);
  }, [numCards, draw]);

  // Auto-submit after draw completes (only once)
  useEffect(() => {
    if (hasDrawn && drawnCards.length > 0 && !hasSubmitted) {
      // Small delay so user can see the result
      const timer = setTimeout(() => {
        setHasSubmitted(true);
        onSubmit(drawnCards);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasDrawn, drawnCards, hasSubmitted, onSubmit]);

  const getCardColor = (card: string) => {
    if (card.includes("hearts") || card.includes("diamonds")) {
      return "text-red-600";
    }
    return "text-gray-900";
  };

  const getCardSymbol = (card: string) => {
    for (const [suit, symbol] of Object.entries(SUIT_SYMBOLS)) {
      if (card.includes(suit)) return symbol;
    }
    return "";
  };

  const getCardValue = (card: string) => {
    return card.split(" of ")[0];
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-xl">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🃏</span>
        <div className="flex flex-col">
          <span className="font-semibold text-gray-800">Draw {numCards === 1 ? "a Card" : `${numCards} Cards`}!</span>
          {reason && <span className="text-sm text-gray-500">{reason}</span>}
          <span className="text-xs text-gray-400">{cardsRemaining} cards remaining in deck</span>
        </div>
      </div>

      {/* Cards Display */}
      <div className="flex items-center justify-center gap-3">
        {(drawnCards.length > 0
          ? drawnCards
          : Array(numCards).fill(null)
        ).map((card, idx) => (
          <div
            key={idx}
            className={cn(
              "flex h-24 w-16 flex-col items-center justify-center rounded-lg border-2 shadow-md transition-all",
              isDrawing && "animate-pulse",
              card
                ? "border-gray-300 bg-white"
                : "border-gray-300 bg-gradient-to-br from-blue-600 to-blue-800"
            )}
          >
            {card ? (
              <>
                <span className={cn("text-2xl font-bold", getCardColor(card))}>
                  {getCardValue(card)}
                </span>
                <span className={cn("text-2xl", getCardColor(card))}>
                  {getCardSymbol(card)}
                </span>
              </>
            ) : (
              <span className="text-2xl text-white">?</span>
            )}
          </div>
        ))}
      </div>

      {/* Card Name Display */}
      {hasDrawn && drawnCards.length > 0 && (
        <div className="text-center">
          {wasReshuffled && (
            <p className="text-xs text-blue-500 mb-1 flex items-center justify-center gap-1">
              <span>🔄</span> Deck reshuffled!
            </p>
          )}
          <span className="font-semibold text-gray-700">
            {drawnCards.join(", ")}
          </span>
          <p className="text-xs text-gray-400 mt-1">Submitting...</p>
        </div>
      )}

      {/* Draw Button - only shown before drawing */}
      {!hasDrawn && (
        <Button
          onClick={drawCards}
          disabled={isDrawing}
          className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
        >
          {isDrawing ? "Drawing..." : "Draw Card"}
        </Button>
      )}
    </div>
  );
}

export interface GameInputRequest {
  type: "game_input";
  request: "dice" | "card" | "inventory_state" | "region_state" | "state_check";
  num_dice?: number;
  num_cards?: number;
  reason?: string;
}

interface GameInputPanelProps {
  request: GameInputRequest;
  onSubmitDice: (values: number[], total: number) => void;
  onSubmitCard: (cards: string[]) => void;
}

export function GameInputPanel({
  request,
  onSubmitDice,
  onSubmitCard,
}: GameInputPanelProps) {
  if (request.request === "dice") {
    return (
      <DiceRoller
        numDice={request.num_dice}
        reason={request.reason}
        onSubmit={onSubmitDice}
      />
    );
  }

  if (request.request === "card") {
    return (
      <CardDrawer
        numCards={request.num_cards}
        reason={request.reason}
        onSubmit={onSubmitCard}
      />
    );
  }

  return null;
}

// Type guard to check if an interrupt is a game input request
export function isGameInputInterrupt(
  interrupt: unknown
): interrupt is GameInputRequest {
  if (!interrupt || typeof interrupt !== "object") return false;
  const obj = interrupt as Record<string, unknown>;
  return obj.type === "game_input" &&
    (obj.request === "dice" || obj.request === "card" || obj.request === "inventory_state" || obj.request === "region_state" || obj.request === "state_check");
}
