import {
    AI_HISTORY_MAX_TURNS,
    type AiTurn,
    type AskPageResponse,
    type AskResponse,
} from '@hisaab/shared';
import { ArrowDown, SquarePen } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { Link } from 'react-router';

import Composer from '@/components/ai/chat/composer';
import {
    AssistantMessage,
    ErrorMessage,
    ThinkingMessage,
    UserMessage,
} from '@/components/ai/chat/message';
import {
    FollowUps,
    StarterSuggestions,
} from '@/components/ai/chat/suggestions';
import { Head } from '@/components/head';
import { PageError, PageLoading } from '@/components/page-state';
import { Button } from '@/components/ui/button';
import { AI_REMAINING_KEY, useAiRequest } from '@/hooks/use-ai';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Follow-up suggestions shown under the latest answer. */
const FOLLOW_UPS = 2;
/** Show "scroll to latest" once this far from the bottom. */
const SCROLL_BUTTON_FROM = 200;

/** One centred reading column. */
const COLUMN = 'mx-auto w-full max-w-3xl px-4 md:px-6';

type Turn = AiTurn & { id: number };

let nextId = 0;
const turn = (role: AiTurn['role'], content: string): Turn => ({
    id: ++nextId,
    role,
    content,
});
const plain = (turns: Turn[]): AiTurn[] =>
    turns.map(({ role, content }) => ({ role, content }));

/**
 * Ask questions about your own portfolio (port of Laravel's ask page), laid
 * out like a chat assistant: the input starts in the middle of the screen
 * and moves to the bottom once a conversation starts. The conversation lives
 * only in this page; the last few turns go with each question.
 */
export default function Ask() {
    const queryClient = useQueryClient();
    const page = useQuery({
        queryKey: ['ai', 'ask'],
        queryFn: async () => {
            const data = await api<AskPageResponse>('/ai/ask');
            queryClient.setQueryData(AI_REMAINING_KEY, data.remaining);
            return data;
        },
    });
    // Bumped by "New chat": remounting the chat clears it completely.
    const [chat, setChat] = useState(0);

    return (
        <>
            <Head title="Ask your portfolio" />

            {/* Exactly the space under the sticky app header (h-16, md:h-14). */}
            <div className="relative flex h-[calc(100dvh-4rem)] flex-col md:h-[calc(100dvh-3.5rem)]">
                {page.isPending ? (
                    <PageLoading />
                ) : page.isError ? (
                    <PageError
                        error={page.error}
                        retry={() => page.refetch()}
                    />
                ) : !page.data.hasFunds ? (
                    <NoFunds />
                ) : (
                    <Chat
                        key={chat}
                        autoFocus={chat > 0}
                        suggestions={page.data.suggestions}
                        onNewChat={() => setChat((n) => n + 1)}
                    />
                )}
            </div>
        </>
    );
}

function NoFunds() {
    return (
        <div
            className={cn(
                COLUMN,
                'flex flex-1 flex-col items-center justify-center gap-3 pb-16 text-center',
            )}
        >
            <h1 className="text-2xl font-semibold tracking-tight">
                Nothing to ask about yet
            </h1>
            <p className="max-w-sm text-sm text-muted-foreground">
                Add a fund and some transactions first, then ask about them
                here.
            </p>
            <Button asChild className="mt-2 rounded-full">
                <Link to="/holdings/create">Add a fund</Link>
            </Button>
        </div>
    );
}

function Chat({
    suggestions,
    autoFocus,
    onNewChat,
}: {
    suggestions: string[];
    autoFocus: boolean;
    onNewChat: () => void;
}) {
    const [turns, setTurns] = useState<Turn[]>([]);
    const [question, setQuestion] = useState('');
    // The answer that should reveal word by word (the newest one).
    const [revealId, setRevealId] = useState<number | null>(null);
    const ai = useAiRequest<AskResponse>();
    const onRevealed = useCallback(() => setRevealId(null), []);

    const scroller = useRef<HTMLDivElement>(null);
    const lastQuestion = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const [viewHeight, setViewHeight] = useState(0);
    const [showScrollDown, setShowScrollDown] = useState(false);

    const asked = new Set(
        turns.filter((t) => t.role === 'user').map((t) => t.content),
    );
    const unasked = suggestions.filter((s) => !asked.has(s));
    const lastUser = turns.findLastIndex((t) => t.role === 'user');
    const started = turns.length > 0 || ai.loading;

    useEffect(() => {
        if (autoFocus) input.current?.focus();
    }, [autoFocus]);

    // The latest exchange is at least one screen tall, so its question can sit at the top.
    useLayoutEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const observer = new ResizeObserver(() =>
            setViewHeight(el.clientHeight),
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [started]);

    // A new question moves to the top, so its answer reads from the first line.
    useEffect(() => {
        if (lastUser >= 0)
            lastQuestion.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
    }, [lastUser]);

    function onScroll() {
        const el = scroller.current;
        if (!el) return;
        setShowScrollDown(
            el.scrollHeight - el.scrollTop - el.clientHeight >
                SCROLL_BUTTON_FROM,
        );
    }

    async function ask(text: string, earlier: Turn[]) {
        const result = await ai.run('/ai/ask', {
            question: text,
            // The server accepts the last few turns; older ones are dropped.
            history: plain(earlier.slice(-AI_HISTORY_MAX_TURNS)),
        });
        if (result) {
            const answer = turn('assistant', result.text);
            setRevealId(answer.id);
            setTurns((current) => [...current, answer]);
        }
        return result;
    }

    async function send(text: string) {
        const trimmed = text.trim();
        if (!trimmed || ai.loading) return;

        const earlier = turns;
        setTurns([...earlier, turn('user', trimmed)]);
        setQuestion('');

        if (!(await ask(trimmed, earlier))) {
            // Keep the question so it can be sent again.
            setTurns(earlier);
            setQuestion(trimmed);
        }
    }

    /** Re-asks the latest question and replaces its answer (kept if the retry fails). */
    async function retry() {
        const last = turns.at(-1);
        const q = turns[lastUser];
        if (ai.loading || last?.role !== 'assistant' || !q) return;

        setTurns(turns.slice(0, -1));
        if (!(await ask(q.content, turns.slice(0, lastUser)))) setTurns(turns);
    }

    const composer = (
        <motion.div
            layoutId="composer"
            transition={{ type: 'spring', bounce: 0, duration: 0.45 }}
        >
            <Composer
                value={question}
                onChange={setQuestion}
                onSend={() => send(question)}
                busy={ai.loading}
                placeholder={
                    started ? 'Ask a follow-up…' : 'Ask about your portfolio…'
                }
                inputRef={input}
            />
        </motion.div>
    );

    if (!started) {
        return (
            <div className="flex-1 overflow-y-auto">
                <div
                    className={cn(
                        COLUMN,
                        'flex min-h-full flex-col justify-center gap-6 py-8 pb-[12vh]',
                    )}
                >
                    <div className="space-y-2 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                            What would you like to know?
                        </h1>
                        <p className="text-sm text-muted-foreground sm:text-base">
                            Ask about your funds, returns and allocation.
                            Answers use your own figures.
                        </p>
                    </div>
                    {composer}
                    {ai.error && (
                        <ErrorMessage
                            message={ai.error}
                            onRetry={() => send(question)}
                        />
                    )}
                    <StarterSuggestions questions={unasked} onPick={send} />
                </div>
            </div>
        );
    }

    const before = turns.slice(0, Math.max(lastUser, 0));
    const latest = turns.slice(Math.max(lastUser, 0));
    // After a failed retry the question box is empty: Try again retries the answer.
    const tryAgain = () =>
        question === '' && turns.at(-1)?.role === 'assistant'
            ? retry()
            : send(question);

    return (
        <>
            {/* Full width so the scrollbar sits at the page edge. */}
            <div
                ref={scroller}
                onScroll={onScroll}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
                <div
                    className={cn(COLUMN, 'space-y-8 pt-16')}
                    aria-live="polite"
                >
                    {before.map((t) =>
                        t.role === 'user' ? (
                            <UserMessage key={t.id} text={t.content} />
                        ) : (
                            <AssistantMessage
                                key={t.id}
                                text={t.content}
                                animate={false}
                            />
                        ),
                    )}

                    {/* The latest exchange fills the view, so the question can sit at the top. */}
                    <div
                        className="space-y-6 pb-6"
                        style={{
                            minHeight:
                                viewHeight > 0 ? viewHeight - 32 : undefined,
                        }}
                    >
                        {latest.map((t, i) =>
                            t.role === 'user' ? (
                                <UserMessage
                                    key={t.id}
                                    ref={i === 0 ? lastQuestion : undefined}
                                    text={t.content}
                                />
                            ) : (
                                <AssistantMessage
                                    key={t.id}
                                    text={t.content}
                                    animate={t.id === revealId}
                                    onRevealed={onRevealed}
                                    onRetry={
                                        i === latest.length - 1
                                            ? retry
                                            : undefined
                                    }
                                />
                            ),
                        )}
                        {ai.loading && <ThinkingMessage />}
                        {ai.error && !ai.loading && (
                            <ErrorMessage
                                message={ai.error}
                                onRetry={tryAgain}
                            />
                        )}
                        {!ai.loading &&
                            !ai.error &&
                            revealId === null &&
                            turns.at(-1)?.role === 'assistant' &&
                            unasked.length > 0 && (
                                <FollowUps
                                    questions={unasked.slice(0, FOLLOW_UPS)}
                                    onPick={send}
                                />
                            )}
                    </div>
                </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
                <div className={cn(COLUMN, 'flex justify-end pt-3')}>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onNewChat}
                        disabled={ai.loading}
                        className="pointer-events-auto rounded-full bg-background/80 shadow-xs backdrop-blur"
                        aria-label="New chat"
                    >
                        <SquarePen className="size-4" strokeWidth={1.75} />
                        <span className="hidden sm:inline">New chat</span>
                    </Button>
                </div>
            </div>

            <div className="relative shrink-0">
                {/* Fades the thread out above the input instead of a hard line. */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-linear-to-t from-background to-transparent"
                />
                {showScrollDown && (
                    <div className="absolute inset-x-0 -top-14 flex justify-center">
                        <Button
                            variant="outline"
                            size="icon"
                            aria-label="Scroll to latest"
                            className="size-9 rounded-full bg-background shadow-md"
                            onClick={() =>
                                scroller.current?.scrollTo({
                                    top: scroller.current.scrollHeight,
                                    behavior: 'smooth',
                                })
                            }
                        >
                            <ArrowDown className="size-4" strokeWidth={2} />
                        </Button>
                    </div>
                )}
                <div
                    className={cn(
                        COLUMN,
                        'bg-background pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
                    )}
                >
                    {composer}
                </div>
            </div>
        </>
    );
}
