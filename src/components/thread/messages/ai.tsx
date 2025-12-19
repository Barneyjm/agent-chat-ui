import { parsePartialJson } from "@langchain/core/output_parsers";
import { useStreamContext } from "@/providers/Stream";
import { AIMessage, Checkpoint, Message } from "@langchain/langgraph-sdk";
import { getContentString } from "../utils";
import { BranchSwitcher, CommandBar } from "./shared";
import { MarkdownText } from "../markdown-text";
import { LoadExternalComponent } from "@langchain/langgraph-sdk/react-ui";
import { cn } from "@/lib/utils";
import { ToolCalls, ToolResult } from "./tool-calls";
import { MessageContentComplex } from "@langchain/core/messages";
import { Fragment, memo, useState, useEffect, useCallback, useRef } from "react";
import { isAgentInboxInterruptSchema } from "@/lib/agent-inbox-interrupt";
import { ThreadView } from "../agent-inbox";
import { useQueryState, parseAsBoolean } from "nuqs";
import { GenericInterruptView } from "./generic-interrupt";
import { useArtifact } from "../artifact";
import { GameInputPanel, isGameInputInterrupt, type GameInputRequest } from "../game-input-panel";

// Hook to extract average color from an image
function useAverageColor(imageSrc: string | null): string | null {
  const [avgColor, setAvgColor] = useState<string | null>(null);

  useEffect(() => {
    if (!imageSrc) {
      setAvgColor(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Use a small size for performance
      const sampleSize = 50;
      canvas.width = sampleSize;
      canvas.height = sampleSize;

      // Draw scaled image
      ctx.drawImage(img, 0, 0, sampleSize, sampleSize);

      // Get pixel data
      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
      const data = imageData.data;

      let r = 0, g = 0, b = 0;
      const pixelCount = data.length / 4;

      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }

      // Calculate average
      r = Math.round(r / pixelCount);
      g = Math.round(g / pixelCount);
      b = Math.round(b / pixelCount);

      setAvgColor(`rgb(${r}, ${g}, ${b})`);
    };

    img.src = imageSrc;
  }, [imageSrc]);

  return avgColor;
}

function CustomComponent({
  message,
  thread,
}: {
  message: Message;
  thread: ReturnType<typeof useStreamContext>;
}) {
  const artifact = useArtifact();
  const { values } = useStreamContext();
  const customComponents = values.ui?.filter(
    (ui) => ui.metadata?.message_id === message.id,
  );

  if (!customComponents?.length) return null;
  return (
    <Fragment key={message.id}>
      {customComponents.map((customComponent) => (
        <LoadExternalComponent
          key={customComponent.id}
          stream={thread}
          message={customComponent}
          meta={{ ui: customComponent, artifact }}
        />
      ))}
    </Fragment>
  );
}

function parseAnthropicStreamedToolCalls(
  content: MessageContentComplex[],
): AIMessage["tool_calls"] {
  const toolCallContents = content.filter((c) => c.type === "tool_use" && c.id);

  return toolCallContents.map((tc) => {
    const toolCall = tc as Record<string, any>;
    let json: Record<string, any> = {};
    if (toolCall?.input) {
      try {
        json = parsePartialJson(toolCall.input) ?? {};
      } catch {
        // Pass
      }
    }
    return {
      name: toolCall.name ?? "",
      id: toolCall.id ?? "",
      args: json,
      type: "tool_call",
    };
  });
}

interface InterruptProps {
  interrupt?: unknown;
  isLastMessage: boolean;
  hasNoAIOrToolMessages: boolean;
}

export function useLatestImage() {
  const { values } = useStreamContext();
  const latestImage = (values as Record<string, unknown>)?.latest_image;

  // Return the model's image if available, otherwise fall back to welcome image
  if (latestImage && typeof latestImage === "string" && latestImage.startsWith("data:image/")) {
    return latestImage;
  }

  // Fall back to welcome image
  return "/welcome.webp";
}

export function StateImage() {
  const latestImage = useLatestImage();

  if (!latestImage) {
    return null;
  }

  return (
    <div className="my-2">
      <img
        src={latestImage}
        alt="Generated scene"
        className="max-w-full h-auto rounded-lg shadow-md"
      />
    </div>
  );
}

// Inventory item type
interface InventoryItem {
  name: string;
  weight: number;
  description?: string;
  effect?: string;
}

// Hook to get game state
export function useGameState() {
  const { values } = useStreamContext();
  const vals = values as Record<string, unknown>;

  // Backend uses last_card (singular) - can be string or string[]
  const lastCardRaw = vals?.last_card;
  let lastCards: string[] | undefined;
  if (typeof lastCardRaw === "string") {
    lastCards = [lastCardRaw];
  } else if (Array.isArray(lastCardRaw)) {
    lastCards = lastCardRaw as string[];
  }

  // Parse inventory - can be array of objects or strings
  const inventoryRaw = vals?.inventory;
  let inventory: InventoryItem[] | undefined;
  if (Array.isArray(inventoryRaw)) {
    inventory = inventoryRaw.map((item) => {
      if (typeof item === "string") {
        return { name: item, weight: 1 };
      }
      return item as InventoryItem;
    });
  }

  return {
    sleepiness: vals?.sleepiness as number | undefined,
    maxSleepiness: vals?.max_sleepiness as number | undefined,
    giftsFound: vals?.gifts_found as number | undefined,
    totalGifts: vals?.total_gifts as number | undefined,
    lastDice: vals?.last_dice as number[] | undefined,
    lastDiceTotal: vals?.last_dice_total as number | undefined,
    lastCards,
    lastResult: vals?.last_result as string | undefined,
    currentLocation: vals?.current_location as string | undefined,
    inventory,
    inventoryCapacity: vals?.inventory_capacity as number | undefined,
    discoveredRegions: vals?.discovered_regions as string[] | undefined,
    regionActionTaken: vals?.region_action_taken as boolean | undefined,
    turnsRemaining: vals?.turns_remaining as number | undefined,
    searchesRemainingInRegion: vals?.searches_remaining_in_region as number | undefined,
    regionSearchCounts: vals?.region_search_counts as Record<string, number> | undefined,
  };
}

// Helper to get card numeric value
function getCardValue(card: string): number {
  const value = card.split(" of ")[0];
  if (value === "A") return 1;
  if (value === "J") return 11;
  if (value === "Q") return 12;
  if (value === "K") return 13;
  return parseInt(value) || 0;
}

// Helper to get card suit symbol
function getCardSuit(card: string): string {
  if (card.includes("hearts")) return "♥";
  if (card.includes("diamonds")) return "♦";
  if (card.includes("clubs")) return "♣";
  if (card.includes("spades")) return "♠";
  return "";
}

// Helper to check if card is red
function isRedCard(card: string): boolean {
  return card.includes("hearts") || card.includes("diamonds");
}

function GameStatusDisplay({ overlay = false }: { overlay?: boolean }) {
  const {
    sleepiness,
    maxSleepiness,
    giftsFound,
    totalGifts,
    lastDice,
    lastDiceTotal,
    lastCards,
    lastResult,
    inventory,
    inventoryCapacity,
    discoveredRegions,
    regionActionTaken,
    turnsRemaining
  } = useGameState();

  // Default max sleepiness to 5 if not provided
  const sleepMax = maxSleepiness ?? 5;

  // Calculate total inventory weight
  const totalWeight = inventory?.reduce((sum, item) => sum + (item.weight || 1), 0) ?? 0;
  const capacity = inventoryCapacity ?? 8;

  // Always show status bar once we have any game state
  const hasGameState = sleepiness !== undefined || giftsFound !== undefined || lastDice || lastCards || (inventory && inventory.length > 0) || (discoveredRegions && discoveredRegions.length > 0) || regionActionTaken !== undefined || turnsRemaining !== undefined;

  if (!hasGameState) {
    return null;
  }

  // Calculate dice total if not provided
  const diceTotal = lastDiceTotal ?? (lastDice?.reduce((a, b) => a + b, 0) ?? 0);

  return (
    <div className={cn(
      "flex flex-col gap-2",
      overlay
        ? "rounded-lg bg-black/60 p-3 backdrop-blur-sm"
        : "rounded-xl bg-white/95 p-4 shadow-lg backdrop-blur-sm"
    )}>
      {/* Last Action Result */}
      {lastResult && (
        <div className={cn(
          "text-center py-1 px-3 rounded-lg font-bold text-sm",
          overlay ? "bg-white/20 text-white" : (
            lastResult.includes("SPARKLE") ? "bg-yellow-100 text-yellow-700" :
            lastResult.includes("FLURRY") ? "bg-blue-100 text-blue-700" :
            lastResult.includes("SNOWDRIFT") ? "bg-purple-100 text-purple-700" : ""
          )
        )}>
          {lastResult.includes("SPARKLE") && "✨ "}
          {lastResult.includes("FLURRY") && "❄️ "}
          {lastResult.includes("SNOWDRIFT") && "🌨️ "}
          {lastResult}
        </div>
      )}

      {/* Dice vs Cards Comparison */}
      {(lastDice || lastCards) && (
        <div className="flex items-center justify-center gap-2">
          {/* Dice */}
          {lastDice && lastDice.length > 0 && (
            <div className="flex items-center gap-1">
              {lastDice.map((value, idx) => (
                <div
                  key={idx}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-red-700 text-xs font-bold text-white shadow"
                >
                  {value}
                </div>
              ))}
              <div className={cn(
                "mx-1 rounded px-2 py-0.5 text-xs font-bold",
                overlay ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"
              )}>
                ={diceTotal}
              </div>
            </div>
          )}

          {/* VS indicator */}
          {lastDice && lastCards && (
            <span className={cn("text-xs font-bold", overlay ? "text-white/60" : "text-gray-400")}>vs</span>
          )}

          {/* Cards */}
          {lastCards && lastCards.length > 0 && (
            <div className="flex items-center gap-1">
              {lastCards.map((card, idx) => {
                const cardValue = getCardValue(card);
                const isBeaten = diceTotal > cardValue;
                return (
                  <div
                    key={idx}
                    className={cn(
                      "relative flex h-9 w-7 flex-col items-center justify-center rounded border-2 bg-white text-xs font-bold shadow",
                      isRedCard(card) ? "text-red-600" : "text-gray-800",
                      isBeaten ? "border-green-500 bg-green-50" : "border-gray-300"
                    )}
                    title={`${card} (value: ${cardValue}) - ${isBeaten ? "Beaten!" : "Not beaten"}`}
                  >
                    <span className="text-[10px]">{card.split(" of ")[0]}</span>
                    <span className="text-[10px]">{getCardSuit(card)}</span>
                    {isBeaten && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-green-500 text-[6px] text-white">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Stats Row */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {/* Sleepiness */}
        {sleepiness !== undefined && (
          <div className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            overlay ? (
              sleepiness <= 1 ? "bg-green-500/80 text-white" :
              sleepiness === 2 ? "bg-yellow-500/80 text-white" :
              "bg-red-500/80 text-white"
            ) : (
              sleepiness <= 1 ? "bg-green-100 text-green-700" :
              sleepiness === 2 ? "bg-yellow-100 text-yellow-700" :
              "bg-red-100 text-red-700"
            )
          )}>
            <span>😴</span>
            <span>{sleepiness}/{sleepMax}</span>
          </div>
        )}

        {/* Gifts Found */}
        {giftsFound !== undefined && (
          <div className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            overlay ? "bg-yellow-500/80 text-white" : "bg-yellow-100 text-yellow-700"
          )}>
            <span>🎁</span>
            <span>{giftsFound}{totalGifts !== undefined ? `/${totalGifts}` : ''}</span>
          </div>
        )}

        {/* Inventory with weight */}
        {inventory && inventory.length > 0 && (
          <div
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              overlay ? (
                totalWeight >= capacity ? "bg-red-500/80 text-white" :
                totalWeight >= capacity - 2 ? "bg-yellow-500/80 text-white" :
                "bg-blue-500/80 text-white"
              ) : (
                totalWeight >= capacity ? "bg-red-100 text-red-700" :
                totalWeight >= capacity - 2 ? "bg-yellow-100 text-yellow-700" :
                "bg-blue-100 text-blue-700"
              )
            )}
            title={inventory.map(i => `${i.name} (${i.weight})`).join(", ")}
          >
            <span>🎒</span>
            <span>{totalWeight}/{capacity}</span>
          </div>
        )}

        {/* Regions explored */}
        {discoveredRegions && discoveredRegions.length > 0 && (
          <div className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            overlay ? "bg-purple-500/80 text-white" : "bg-purple-100 text-purple-700"
          )}>
            <span>🗺️</span>
            <span>{discoveredRegions.length} {discoveredRegions.length === 1 ? "area" : "areas"}</span>
          </div>
        )}

        {/* Gift search ready indicator */}
        {regionActionTaken !== undefined && (
          <div className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            overlay ? (
              regionActionTaken ? "bg-emerald-500/80 text-white" : "bg-white/30 text-white/80"
            ) : (
              regionActionTaken ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
            )
          )}>
            <span>{regionActionTaken ? "🔍" : "⏳"}</span>
            <span>{regionActionTaken ? "Can search" : "Explore first"}</span>
          </div>
        )}

        {/* Christmas Clock - turns remaining */}
        {turnsRemaining !== undefined && (
          <div className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            overlay ? (
              turnsRemaining <= 5 ? "bg-red-500/80 text-white" :
              turnsRemaining <= 10 ? "bg-orange-500/80 text-white" :
              "bg-sky-500/80 text-white"
            ) : (
              turnsRemaining <= 5 ? "bg-red-100 text-red-700" :
              turnsRemaining <= 10 ? "bg-orange-100 text-orange-700" :
              "bg-sky-100 text-sky-700"
            )
          )}>
            <span>🕐</span>
            <span>{turnsRemaining}</span>
          </div>
        )}
      </div>

    </div>
  );
}

// Mobile hero banner - shows at top on small screens
export function SceneBanner() {
  const latestImage = useLatestImage();

  if (!latestImage) {
    return null;
  }

  return (
    <div className="relative w-full flex-shrink-0 overflow-hidden bg-gray-900 lg:hidden">
      {/* 16:9 aspect ratio container */}
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <img
          src={latestImage}
          alt="Current scene"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    </div>
  );
}

// Desktop side panel - shows on right on large screens
export function EnvironmentPanel() {
  const latestImage = useLatestImage();
  const avgColor = useAverageColor(latestImage);
  const stream = useStreamContext();
  const { inventory, inventoryCapacity, regionActionTaken, sleepiness, currentLocation, turnsRemaining, giftsFound, regionSearchCounts } = useGameState();

  // Check if there's a game input interrupt
  const interrupt = stream.interrupt;
  const interruptValue = Array.isArray(interrupt)
    ? interrupt[0]?.value
    : (interrupt as { value?: unknown } | undefined)?.value ?? interrupt;

  const gameInputRequest = isGameInputInterrupt(interruptValue)
    ? (interruptValue as GameInputRequest)
    : null;

  // Track which interrupt we've already handled to prevent double-submission
  const handledInterruptRef = useRef<string | null>(null);
  const interruptKey = gameInputRequest ? `${gameInputRequest.request}-${JSON.stringify(interrupt)}` : null;

  // Use refs for state values to avoid effect re-triggering on state changes
  const stateRef = useRef({ inventory, inventoryCapacity, regionActionTaken, turnsRemaining, giftsFound });
  useEffect(() => {
    stateRef.current = { inventory, inventoryCapacity, regionActionTaken, turnsRemaining, giftsFound };
  }, [inventory, inventoryCapacity, regionActionTaken, turnsRemaining, giftsFound]);

  // Auto-respond to inventory_state, region_state, and state_check requests
  useEffect(() => {
    if (!gameInputRequest || handledInterruptRef.current === interruptKey) return;

    if (gameInputRequest.request === "inventory_state") {
      handledInterruptRef.current = interruptKey;
      const inventoryData = stateRef.current.inventory?.map(item => ({
        name: item.name,
        weight: item.weight,
        description: item.description,
        effect: item.effect,
      })) ?? [];

      stream.submit(
        {},
        {
          command: {
            resume: {
              inventory: inventoryData,
              inventory_capacity: stateRef.current.inventoryCapacity ?? 8,
            },
          },
        }
      );
    } else if (gameInputRequest.request === "region_state") {
      handledInterruptRef.current = interruptKey;
      stream.submit(
        {},
        {
          command: {
            resume: {
              region_action_taken: stateRef.current.regionActionTaken ?? false,
            },
          },
        }
      );
    } else if (gameInputRequest.request === "state_check") {
      handledInterruptRef.current = interruptKey;
      stream.submit(
        {},
        {
          command: {
            resume: {
              turns_remaining: stateRef.current.turnsRemaining ?? 24,
              gifts_found: stateRef.current.giftsFound ?? 0,
            },
          },
        }
      );
    }
  }, [gameInputRequest, interruptKey, stream]);

  // Handle dice submission - includes all required fields
  const handleDiceSubmit = useCallback(
    (values: number[], total: number) => {
      const inventoryData = inventory?.map(item => ({
        name: item.name,
        weight: item.weight,
        description: item.description,
        effect: item.effect,
      })) ?? [];

      stream.submit(
        {},
        {
          command: {
            resume: {
              dice_values: values,
              dice_total: total,
              sleepiness: sleepiness ?? 0,
              turns_remaining: turnsRemaining ?? 24,
              inventory: inventoryData,
            },
          },
        }
      );
    },
    [stream, sleepiness, turnsRemaining, inventory]
  );

  // Handle card submission - includes all required fields
  const handleCardSubmit = useCallback(
    (cards: string[]) => {
      const inventoryData = inventory?.map(item => ({
        name: item.name,
        weight: item.weight,
        description: item.description,
        effect: item.effect,
      })) ?? [];

      stream.submit(
        {},
        {
          command: {
            resume: {
              cards: cards,
              sleepiness: sleepiness ?? 0,
              turns_remaining: turnsRemaining ?? 24,
              region_action_taken: regionActionTaken ?? false,
              current_location: currentLocation,
              gifts_found: giftsFound ?? 0,
              inventory: inventoryData,
              inventory_capacity: inventoryCapacity ?? 8,
              region_search_counts: regionSearchCounts ?? {},
            },
          },
        }
      );
    },
    [stream, sleepiness, turnsRemaining, regionActionTaken, currentLocation, giftsFound, inventory, inventoryCapacity, regionSearchCounts]
  );

  if (!latestImage) {
    return null;
  }

  const showGameInput = gameInputRequest &&
    gameInputRequest.request !== "inventory_state" &&
    gameInputRequest.request !== "region_state" &&
    gameInputRequest.request !== "state_check";

  return (
    <div
      className="flex h-full w-full flex-col border-l transition-colors duration-500 overflow-auto"
      style={{ backgroundColor: avgColor ?? "rgb(245, 245, 245)" }}
    >
      {/* Image container - shows full image */}
      <div className="flex-shrink-0 p-4">
        <img
          src={latestImage}
          alt="Current scene"
          className="w-full rounded-lg object-contain shadow-lg"
        />
      </div>

      {/* Status display */}
      <div className="flex-shrink-0 px-4 pb-4">
        <GameStatusDisplay />
      </div>

      {/* Game input panel when active */}
      {showGameInput && (
        <div className="flex-shrink-0 px-4 pb-4">
          <GameInputPanel
            request={gameInputRequest}
            onSubmitDice={handleDiceSubmit}
            onSubmitCard={handleCardSubmit}
          />
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  );
}

// Game status bar for mobile - sits above chat messages
export function GameStatusBar() {
  const stream = useStreamContext();
  const { inventory, inventoryCapacity, regionActionTaken, sleepiness, currentLocation, turnsRemaining, giftsFound, regionSearchCounts } = useGameState();

  // Check if there's a game input interrupt
  const interrupt = stream.interrupt;
  const interruptValue = Array.isArray(interrupt)
    ? interrupt[0]?.value
    : (interrupt as { value?: unknown } | undefined)?.value ?? interrupt;

  const gameInputRequest = isGameInputInterrupt(interruptValue)
    ? (interruptValue as GameInputRequest)
    : null;

  // Track which interrupt we've already handled to prevent double-submission
  const handledInterruptRef = useRef<string | null>(null);
  const interruptKey = gameInputRequest ? `${gameInputRequest.request}-${JSON.stringify(interrupt)}` : null;

  // Use refs for state values to avoid effect re-triggering on state changes
  const stateRef = useRef({ inventory, inventoryCapacity, regionActionTaken, turnsRemaining, giftsFound });
  useEffect(() => {
    stateRef.current = { inventory, inventoryCapacity, regionActionTaken, turnsRemaining, giftsFound };
  }, [inventory, inventoryCapacity, regionActionTaken, turnsRemaining, giftsFound]);

  // Auto-respond to inventory_state, region_state, and state_check requests
  useEffect(() => {
    if (!gameInputRequest || handledInterruptRef.current === interruptKey) return;

    if (gameInputRequest.request === "inventory_state") {
      handledInterruptRef.current = interruptKey;
      const inventoryData = stateRef.current.inventory?.map(item => ({
        name: item.name,
        weight: item.weight,
        description: item.description,
        effect: item.effect,
      })) ?? [];

      stream.submit(
        {},
        {
          command: {
            resume: {
              inventory: inventoryData,
              inventory_capacity: stateRef.current.inventoryCapacity ?? 8,
            },
          },
        }
      );
    } else if (gameInputRequest.request === "region_state") {
      handledInterruptRef.current = interruptKey;
      stream.submit(
        {},
        {
          command: {
            resume: {
              region_action_taken: stateRef.current.regionActionTaken ?? false,
            },
          },
        }
      );
    } else if (gameInputRequest.request === "state_check") {
      handledInterruptRef.current = interruptKey;
      stream.submit(
        {},
        {
          command: {
            resume: {
              turns_remaining: stateRef.current.turnsRemaining ?? 24,
              gifts_found: stateRef.current.giftsFound ?? 0,
            },
          },
        }
      );
    }
  }, [gameInputRequest, interruptKey, stream]);

  // Handle dice submission - includes all required fields
  const handleDiceSubmit = useCallback(
    (values: number[], total: number) => {
      const inventoryData = inventory?.map(item => ({
        name: item.name,
        weight: item.weight,
        description: item.description,
        effect: item.effect,
      })) ?? [];

      stream.submit(
        {},
        {
          command: {
            resume: {
              dice_values: values,
              dice_total: total,
              sleepiness: sleepiness ?? 0,
              turns_remaining: turnsRemaining ?? 24,
              inventory: inventoryData,
            },
          },
        }
      );
    },
    [stream, sleepiness, turnsRemaining, inventory]
  );

  // Handle card submission - includes all required fields
  const handleCardSubmit = useCallback(
    (cards: string[]) => {
      const inventoryData = inventory?.map(item => ({
        name: item.name,
        weight: item.weight,
        description: item.description,
        effect: item.effect,
      })) ?? [];

      stream.submit(
        {},
        {
          command: {
            resume: {
              cards: cards,
              sleepiness: sleepiness ?? 0,
              turns_remaining: turnsRemaining ?? 24,
              region_action_taken: regionActionTaken ?? false,
              current_location: currentLocation,
              gifts_found: giftsFound ?? 0,
              inventory: inventoryData,
              inventory_capacity: inventoryCapacity ?? 8,
              region_search_counts: regionSearchCounts ?? {},
            },
          },
        }
      );
    },
    [stream, sleepiness, turnsRemaining, regionActionTaken, currentLocation, giftsFound, inventory, inventoryCapacity, regionSearchCounts]
  );

  const showGameInput = gameInputRequest &&
    gameInputRequest.request !== "inventory_state" &&
    gameInputRequest.request !== "region_state" &&
    gameInputRequest.request !== "state_check";

  return (
    <div className="flex flex-col gap-3 px-4 py-3 bg-gradient-to-b from-gray-100 to-transparent lg:hidden">
      {/* Status badges row */}
      <div className="flex justify-center">
        <GameStatusDisplay />
      </div>

      {/* Game input panel when active */}
      {showGameInput && (
        <div className="flex justify-center">
          <GameInputPanel
            request={gameInputRequest}
            onSubmitDice={handleDiceSubmit}
            onSubmitCard={handleCardSubmit}
          />
        </div>
      )}
    </div>
  );
}

function Interrupt({
  interrupt,
  isLastMessage,
  hasNoAIOrToolMessages,
}: InterruptProps) {
  const fallbackValue = Array.isArray(interrupt)
    ? (interrupt as Record<string, any>[])
    : (((interrupt as { value?: unknown } | undefined)?.value ??
        interrupt) as Record<string, any>);

  return (
    <>
      {isAgentInboxInterruptSchema(interrupt) &&
        (isLastMessage || hasNoAIOrToolMessages) && (
          <ThreadView interrupt={interrupt} />
        )}
      {interrupt &&
      !isAgentInboxInterruptSchema(interrupt) &&
      (isLastMessage || hasNoAIOrToolMessages) ? (
        <GenericInterruptView interrupt={fallbackValue} />
      ) : null}
    </>
  );
}

function AssistantMessageImpl({
  message,
  isLoading,
  handleRegenerate,
}: {
  message: Message | undefined;
  isLoading: boolean;
  handleRegenerate: (parentCheckpoint: Checkpoint | null | undefined) => void;
}) {
  const content = message?.content ?? [];
  const contentString = getContentString(content);
  const [hideToolCalls] = useQueryState(
    "hideToolCalls",
    parseAsBoolean.withDefault(true),
  );

  const thread = useStreamContext();
  const isLastMessage =
    thread.messages[thread.messages.length - 1].id === message?.id;
  const hasNoAIOrToolMessages = !thread.messages.find(
    (m) => m.type === "ai" || m.type === "tool",
  );
  const meta = message ? thread.getMessagesMetadata(message) : undefined;
  const threadInterrupt = thread.interrupt;

  const parentCheckpoint = meta?.firstSeenState?.parent_checkpoint;
  const anthropicStreamedToolCalls = Array.isArray(content)
    ? parseAnthropicStreamedToolCalls(content)
    : undefined;

  const hasToolCalls =
    message &&
    "tool_calls" in message &&
    message.tool_calls &&
    message.tool_calls.length > 0;
  const toolCallsHaveContents =
    hasToolCalls &&
    message.tool_calls?.some(
      (tc) => tc.args && Object.keys(tc.args).length > 0,
    );
  const hasAnthropicToolCalls = !!anthropicStreamedToolCalls?.length;
  const isToolResult = message?.type === "tool";

  if (isToolResult && hideToolCalls) {
    return null;
  }

  return (
    <div className="group mr-auto flex w-full items-start gap-2">
      <div className="flex w-full flex-col gap-2">
        {isToolResult ? (
          <>
            <ToolResult message={message} />
            <Interrupt
              interrupt={threadInterrupt}
              isLastMessage={isLastMessage}
              hasNoAIOrToolMessages={hasNoAIOrToolMessages}
            />
          </>
        ) : (
          <>
            {contentString.length > 0 && (
              <div className="py-1">
                <MarkdownText>{contentString}</MarkdownText>
              </div>
            )}

            {!hideToolCalls && (
              <>
                {(hasToolCalls && toolCallsHaveContents && (
                  <ToolCalls toolCalls={message.tool_calls} />
                )) ||
                  (hasAnthropicToolCalls && (
                    <ToolCalls toolCalls={anthropicStreamedToolCalls} />
                  )) ||
                  (hasToolCalls && (
                    <ToolCalls toolCalls={message.tool_calls} />
                  ))}
              </>
            )}

            {message && (
              <CustomComponent
                message={message}
                thread={thread}
              />
            )}
            {/* StateImage moved to Thread component to prevent flickering */}
            <Interrupt
              interrupt={threadInterrupt}
              isLastMessage={isLastMessage}
              hasNoAIOrToolMessages={hasNoAIOrToolMessages}
            />
            <div
              className={cn(
                "mr-auto flex items-center gap-2 transition-opacity",
                "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
              )}
            >
              <BranchSwitcher
                branch={meta?.branch}
                branchOptions={meta?.branchOptions}
                onSelect={(branch) => thread.setBranch(branch)}
                isLoading={isLoading}
              />
              <CommandBar
                content={contentString}
                isLoading={isLoading}
                isAiMessage={true}
                handleRegenerate={() => handleRegenerate(parentCheckpoint)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const AssistantMessage = memo(AssistantMessageImpl);

export function AssistantMessageLoading() {
  return (
    <div className="mr-auto flex items-start gap-2">
      <div className="bg-muted flex h-8 items-center gap-1 rounded-2xl px-4 py-2">
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full"></div>
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_0.5s_infinite] rounded-full"></div>
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_1s_infinite] rounded-full"></div>
      </div>
    </div>
  );
}
