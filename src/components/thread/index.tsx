import { v4 as uuidv4 } from "uuid";
import { ReactNode, useEffect, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useStreamContext } from "@/providers/Stream";
import { useState, FormEvent } from "react";
import { Button } from "../ui/button";
import { Checkpoint, Message } from "@langchain/langgraph-sdk";
import { AssistantMessage, AssistantMessageLoading, SceneBanner, GameStatusBar, EnvironmentPanel, useLatestImage, useGameState } from "./messages/ai";
import { HumanMessage } from "./messages/human";
import {
  DO_NOT_RENDER_ID_PREFIX,
  ensureToolCallsHaveResponses,
} from "@/lib/ensure-tool-responses";
import { TooltipIconButton } from "./tooltip-icon-button";
import {
  ArrowDown,
  LoaderCircle,
  SquarePen,
  XIcon,
  Globe,
  Coffee,
} from "lucide-react";
import { useQueryState, parseAsBoolean } from "nuqs";
import { LANGUAGES, Language, LanguageContext, useTranslation, t } from "@/lib/i18n";
import { DeckContext, loadDeck, saveDeck, drawCardsFromDeck, resetDeck, Card } from "@/lib/deck";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import ThreadHistory from "./history";
import { toast } from "sonner";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { GitHubSVG } from "../icons/github";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  useArtifactOpen,
  ArtifactContent,
  ArtifactTitle,
  useArtifactContext,
} from "./artifact";

function StickyToBottomContent(props: {
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const context = useStickToBottomContext();
  return (
    <div
      ref={context.scrollRef}
      style={{ width: "100%", height: "100%" }}
      className={props.className}
    >
      <div
        ref={context.contentRef}
        className={props.contentClassName}
      >
        {props.content}
      </div>

      {props.footer}
    </div>
  );
}

function ScrollToBottom(props: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      className={props.className}
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="h-4 w-4" />
      <span>Scroll to bottom</span>
    </Button>
  );
}

function OpenGitHubRepo() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href="https://github.com/Barneyjm/agent-chat-ui/tree/vivarium"
            target="_blank"
            className="flex items-center justify-center"
          >
            <GitHubSVG
              width="24"
              height="24"
            />
          </a>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Open GitHub repo</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function BuyMeACoffee() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href="https://buymeacoffee.com/jbarney"
            target="_blank"
            className="flex items-center justify-center text-amber-600 hover:text-amber-700 transition-colors"
          >
            <Coffee className="h-6 w-6" />
          </a>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Buy me a coffee</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function LanguageSelector({
  language,
  setLanguage,
}: {
  language: Language;
  setLanguage: (lang: Language) => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative flex items-center">
            <Globe className="absolute left-2 h-4 w-4 text-gray-500 pointer-events-none" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="cursor-pointer appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-6 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {Object.entries(LANGUAGES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Change language</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const t = useTranslation();
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-red-50 to-green-50 p-4">
      <div className="flex max-w-4xl flex-col items-center gap-4 rounded-3xl bg-white/80 p-6 shadow-2xl backdrop-blur-sm">
        {/* Title */}
        <h1 className="text-3xl font-bold text-red-700 text-center">
          {t("welcome.title")}
        </h1>

        {/* Welcome Image */}
        <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl shadow-lg">
          <img
            src="/welcome.webp"
            alt="Welcome to the North Pole"
            className="h-auto w-full object-cover"
          />
        </div>

        {/* Rules */}
        <div className="w-full rounded-xl bg-gradient-to-r from-red-100 to-green-100 p-4">
          <h2 className="mb-3 text-center text-lg font-semibold text-gray-800">
            {t("welcome.howToPlay")}
          </h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-lg">🗺️</span>
              <span>{t("welcome.rule1")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-lg">🎲</span>
              <span>{t("welcome.rule2")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-lg">🃏</span>
              <span>{t("welcome.rule3")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-lg">🎁</span>
              <span>{t("welcome.rule4")}</span>
            </li>
          </ul>
        </div>

        {/* Start Button */}
        <Button
          onClick={onStart}
          size="lg"
          className="bg-gradient-to-r from-red-600 to-red-700 px-12 py-6 text-xl font-bold shadow-lg transition-all hover:from-red-700 hover:to-red-800 hover:scale-105"
        >
          {t("welcome.begin")}
        </Button>
      </div>
    </div>
  );
}

function SuggestedActions({
  onSelect,
  gameState,
}: {
  onSelect: (text: string) => void;
  gameState: ReturnType<typeof useGameState>;
}) {
  const t = useTranslation();
  const { regionActionTaken, inventory, sleepiness, discoveredRegions, searchesRemainingInRegion } = gameState;

  const suggestions: { text: string; priority?: boolean }[] = [];

  // Gift search - only if action taken AND searches remaining in this region
  const canSearchForGift = regionActionTaken && (searchesRemainingInRegion ?? 2) > 0;
  const searchesExhausted = regionActionTaken && searchesRemainingInRegion === 0;

  if (canSearchForGift) {
    suggestions.push({ text: t("action.searchGift"), priority: true });
  }

  // Always available
  suggestions.push({ text: t("action.lookAround") });
  suggestions.push({ text: t("action.doSomething") });

  // If has inventory items
  if (inventory && inventory.length > 0) {
    suggestions.push({ text: t("action.inventory") });
  }

  // If high sleepiness
  if (sleepiness !== undefined && sleepiness >= 3) {
    suggestions.push({ text: t("action.rest") });
  }

  // Travel options
  if (discoveredRegions && discoveredRegions.length > 1) {
    suggestions.push({ text: t("action.travel") });
  }

  return (
    <div className="flex flex-col gap-2 px-3 pt-3">
      {/* Show exhausted message if action taken but no searches left */}
      {searchesExhausted && (
        <div className="text-xs text-gray-500 italic">
          {t("action.noSearchesLeft")}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {suggestions.slice(0, 4).map(({ text, priority }) => (
          <button
            key={text}
            type="button"
            onClick={() => onSelect(text)}
            className={
              priority
                ? "rounded-full bg-green-100 px-3 py-1.5 text-sm text-green-700 border border-green-400 shadow-[0_0_8px_rgba(34,197,94,0.5)] hover:bg-green-200 hover:shadow-[0_0_12px_rgba(34,197,94,0.7)] transition-all"
                : "rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-600 hover:bg-red-100 hover:text-red-700 transition-colors"
            }
          >
            {priority && "🎁 "}{text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Thread() {
  const [artifactContext, setArtifactContext] = useArtifactContext();
  const [artifactOpen, closeArtifact] = useArtifactOpen();

  const [threadId, _setThreadId] = useQueryState("threadId");
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    "chatHistoryOpen",
    parseAsBoolean.withDefault(false),
  );
  const [hideToolCalls] = useQueryState(
    "hideToolCalls",
    parseAsBoolean.withDefault(true),
  );
  const [language, setLanguage] = useQueryState("lang", { defaultValue: "en" }) as [Language, (lang: Language) => void];
  const [deck, setDeck] = useState<Card[]>(() => loadDeck());
  const [input, setInput] = useState("");
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  // Deck context for card drawing
  const deckContextValue = useMemo(() => ({
    deck,
    cardsRemaining: deck.length,
    draw: (count: number) => {
      const { drawn, remaining, reshuffled } = drawCardsFromDeck(deck, count);
      setDeck(remaining);
      saveDeck(remaining);
      return { cards: drawn, reshuffled };
    },
    reset: () => {
      const newDeck = resetDeck();
      setDeck(newDeck);
    },
  }), [deck]);

  const stream = useStreamContext();
  const messages = stream.messages;
  const isLoading = stream.isLoading;
  const hasEnvironmentImage = !!useLatestImage();
  const gameState = useGameState();

  const lastError = useRef<string | undefined>(undefined);

  const setThreadId = (id: string | null) => {
    _setThreadId(id);

    // close artifact and reset artifact context
    closeArtifact();
    setArtifactContext({});
  };

  useEffect(() => {
    if (!stream.error) {
      lastError.current = undefined;
      return;
    }
    try {
      const message = (stream.error as any).message;
      if (!message || lastError.current === message) {
        // Message has already been logged. do not modify ref, return early.
        return;
      }

      // Message is defined, and it has not been logged yet. Save it, and send the error
      lastError.current = message;
      toast.error("An error occurred. Please try again.", {
        description: (
          <p>
            <strong>Error:</strong> <code>{message}</code>
          </p>
        ),
        richColors: true,
        closeButton: true,
      });
    } catch {
      // no-op
    }
  }, [stream.error]);

  // TODO: this should be part of the useStream hook
  const prevMessageLength = useRef(0);
  useEffect(() => {
    if (
      messages.length !== prevMessageLength.current &&
      messages?.length &&
      messages[messages.length - 1].type === "ai"
    ) {
      setFirstTokenReceived(true);
    }

    prevMessageLength.current = messages.length;
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim().length === 0 || isLoading) return;
    setFirstTokenReceived(false);

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: "human",
      content: input.trim(),
    };

    const toolMessages = ensureToolCallsHaveResponses(stream.messages);

    const context = {
      ...(Object.keys(artifactContext).length > 0 ? artifactContext : {}),
      language,
    };

    stream.submit(
      { messages: [...toolMessages, newHumanMessage], context },
      {
        streamMode: ["values"],
        streamSubgraphs: true,
        streamResumable: true,
        optimisticValues: (prev) => ({
          ...prev,
          context,
          messages: [
            ...(prev.messages ?? []),
            ...toolMessages,
            newHumanMessage,
          ],
        }),
      },
    );

    setInput("");
  };

  const handleRegenerate = useCallback(
    (parentCheckpoint: Checkpoint | null | undefined) => {
      // Do this so the loading state is correct
      prevMessageLength.current = prevMessageLength.current - 1;
      setFirstTokenReceived(false);
      stream.submit(undefined, {
        checkpoint: parentCheckpoint,
        streamMode: ["values"],
        streamSubgraphs: true,
        streamResumable: true,
      });
    },
    [stream],
  );

  const chatStarted = !!threadId || !!messages.length;
  const hasNoAIOrToolMessages = !messages.find(
    (m) => m.type === "ai" || m.type === "tool",
  );

  // Memoize filtered messages to prevent re-filtering on every render
  const filteredMessages = useMemo(
    () => messages.filter((m) => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX)),
    [messages],
  );

  // Handle starting a new adventure
  const handleStartAdventure = useCallback(() => {
    const startMessage: Message = {
      id: uuidv4(),
      type: "human",
      content: t("welcome.startMessage", language),
    };

    stream.submit(
      { messages: [startMessage], context: { language } },
      {
        streamMode: ["values"],
        streamSubgraphs: true,
        streamResumable: true,
        optimisticValues: (prev) => ({
          ...prev,
          context: { language },
          messages: [...(prev.messages ?? []), startMessage],
        }),
      },
    );
  }, [stream, language]);

  // Show welcome screen if chat hasn't started
  if (!chatStarted) {
    return (
      <LanguageContext.Provider value={{ language, setLanguage }}>
        <DeckContext.Provider value={deckContextValue}>
          <div className="flex h-screen w-full">
            {/* Language selector in top right for welcome screen */}
            <div className="absolute top-4 right-4 z-10">
              <LanguageSelector language={language} setLanguage={setLanguage} />
            </div>
            <WelcomeScreen onStart={handleStartAdventure} />
          </div>
        </DeckContext.Provider>
      </LanguageContext.Provider>
    );
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
    <DeckContext.Provider value={deckContextValue}>
    <div className="flex h-screen w-full overflow-hidden">
      <div className="relative hidden lg:flex">
        <motion.div
          className="absolute z-20 h-full overflow-hidden border-r bg-white"
          style={{ width: 300 }}
          animate={
            isLargeScreen
              ? { x: chatHistoryOpen ? 0 : -300 }
              : { x: chatHistoryOpen ? 0 : -300 }
          }
          initial={{ x: -300 }}
          transition={
            isLargeScreen
              ? { type: "spring", stiffness: 300, damping: 30 }
              : { duration: 0 }
          }
        >
          <div
            className="relative h-full"
            style={{ width: 300 }}
          >
            <ThreadHistory />
          </div>
        </motion.div>
      </div>

      <div
        className={cn(
          "grid w-full transition-all duration-500",
          // Dynamic grid columns: [artifact, chat, environment]
          // Desktop (lg+): show environment panel on right
          // Mobile: hide environment panel (use hero banner instead)
          hasEnvironmentImage && artifactOpen && "grid-cols-[2fr_3fr] lg:grid-cols-[2fr_3fr_2fr]",
          hasEnvironmentImage && !artifactOpen && "grid-cols-[0fr_1fr] lg:grid-cols-[0fr_3fr_2fr]",
          !hasEnvironmentImage && artifactOpen && "grid-cols-[2fr_3fr]",
          !hasEnvironmentImage && !artifactOpen && "grid-cols-[0fr_1fr]",
        )}
      >
        {/* Artifact Panel - Left side */}
        <div className={cn(
          "relative flex flex-col border-r overflow-hidden",
          !artifactOpen && "w-0 border-0",
        )}>
          <div className="absolute inset-0 flex min-w-[30vw] flex-col">
            <div className="grid grid-cols-[1fr_auto] border-b p-4">
              <ArtifactTitle className="truncate overflow-hidden" />
              <button
                onClick={closeArtifact}
                className="cursor-pointer"
              >
                <XIcon className="size-5" />
              </button>
            </div>
            <ArtifactContent className="relative flex-grow" />
          </div>
        </div>

        {/* Chat - Center */}
        <motion.div
          className={cn(
            "relative flex min-w-0 flex-1 flex-col overflow-hidden",
            !chatStarted && "grid-rows-[1fr]",
          )}
          layout={isLargeScreen}
          animate={{
            marginLeft: chatHistoryOpen ? (isLargeScreen ? 300 : 0) : 0,
            width: chatHistoryOpen
              ? isLargeScreen
                ? "calc(100% - 300px)"
                : "100%"
              : "100%",
          }}
          transition={
            isLargeScreen
              ? { type: "spring", stiffness: 300, damping: 30 }
              : { duration: 0 }
          }
        >
          {!chatStarted && (
            <div className="absolute top-0 left-0 z-10 flex w-full items-center justify-end gap-3 p-2 pr-4">
              <BuyMeACoffee />
              <OpenGitHubRepo />
            </div>
          )}
          {chatStarted && (
            <div className="relative z-10 flex items-center justify-between gap-3 p-2">
              <button
                className="flex cursor-pointer items-center gap-2 ml-2"
                onClick={() => setThreadId(null)}
              >
                <span className="text-3xl">❄️</span>
                <span className="text-xl font-semibold tracking-tight">
                  {t("app.title", language)}
                </span>
              </button>

              <div className="flex items-center gap-4">
                <LanguageSelector language={language} setLanguage={setLanguage} />
                <div className="flex items-center gap-3">
                  <BuyMeACoffee />
                  <OpenGitHubRepo />
                </div>
                <TooltipIconButton
                  size="lg"
                  className="p-4"
                  tooltip="New thread"
                  variant="ghost"
                  onClick={() => setThreadId(null)}
                >
                  <SquarePen className="size-5" />
                </TooltipIconButton>
              </div>

              <div className="from-background to-background/0 absolute inset-x-0 top-full h-5 bg-gradient-to-b" />
            </div>
          )}

          {/* Scene Banner - below navbar */}
          {hasEnvironmentImage && <SceneBanner />}

          {/* Game Status Bar - below banner, above chat */}
          {hasEnvironmentImage && <GameStatusBar />}

          <StickToBottom className="relative flex-1 overflow-hidden">
            <StickyToBottomContent
              className={cn(
                "absolute inset-0 overflow-y-scroll px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent",
                !chatStarted && "mt-[25vh] flex flex-col items-stretch",
                chatStarted && "grid grid-rows-[1fr_auto]",
              )}
              contentClassName="pt-4 pb-16 max-w-3xl mx-auto flex flex-col gap-4 w-full"
              content={
                <>
                  {filteredMessages.map((message, index) =>
                    message.type === "human" ? (
                      <HumanMessage
                        key={message.id || `${message.type}-${index}`}
                        message={message}
                        isLoading={isLoading}
                      />
                    ) : (
                      <AssistantMessage
                        key={message.id || `${message.type}-${index}`}
                        message={message}
                        isLoading={isLoading}
                        handleRegenerate={handleRegenerate}
                      />
                    ),
                  )}
                  {/* Special rendering case where there are no AI/tool messages, but there is an interrupt.
                    We need to render it outside of the messages list, since there are no messages to render */}
                  {hasNoAIOrToolMessages && !!stream.interrupt && (
                    <AssistantMessage
                      key="interrupt-msg"
                      message={undefined}
                      isLoading={isLoading}
                      handleRegenerate={handleRegenerate}
                    />
                  )}
                  {isLoading && !firstTokenReceived && (
                    <AssistantMessageLoading />
                  )}
                </>
              }
              footer={
                <div className="sticky bottom-0 flex flex-col items-center gap-8 bg-white">
                  {!chatStarted && (
                    <div className="flex items-center gap-3">
                      <span className="text-4xl">❄️</span>
                      <h1 className="text-2xl font-semibold tracking-tight">
                        {t("app.title", language)}
                      </h1>
                    </div>
                  )}

                  <ScrollToBottom className="animate-in fade-in-0 zoom-in-95 absolute bottom-full left-1/2 mb-4 -translate-x-1/2" />

                  <div
                    className="bg-muted relative z-10 mx-auto mb-8 w-full max-w-3xl rounded-2xl border shadow-xs"
                  >
                    <form
                      onSubmit={handleSubmit}
                      className="mx-auto grid max-w-3xl gap-2"
                    >
                      {!stream.isLoading && (
                        <SuggestedActions
                          onSelect={(text) => setInput(text)}
                          gameState={gameState}
                        />
                      )}
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !e.metaKey &&
                            !e.nativeEvent.isComposing
                          ) {
                            e.preventDefault();
                            const el = e.target as HTMLElement | undefined;
                            const form = el?.closest("form");
                            form?.requestSubmit();
                          }
                        }}
                        placeholder={t("input.placeholder", language)}
                        className="field-sizing-content resize-none border-none bg-transparent p-3.5 pb-0 shadow-none ring-0 outline-none focus:ring-0 focus:outline-none"
                      />

                      <div className="flex items-center justify-end gap-2 p-2 pt-4">
                        {stream.isLoading ? (
                          <Button
                            key="stop"
                            onClick={() => stream.stop()}
                          >
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            {t("button.cancel", language)}
                          </Button>
                        ) : (
                          <Button
                            type="submit"
                            className="shadow-md transition-all"
                            disabled={isLoading || !input.trim()}
                          >
                            {t("button.send", language)}
                          </Button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>
              }
            />
          </StickToBottom>
        </motion.div>

        {/* Environment Panel - Right side (desktop only) */}
        <div className={cn(
          "relative overflow-hidden transition-all duration-500 hidden lg:block",
          hasEnvironmentImage ? "min-w-[300px]" : "w-0",
        )}>
          <EnvironmentPanel />
        </div>
      </div>
    </div>
    </DeckContext.Provider>
    </LanguageContext.Provider>
  );
}
