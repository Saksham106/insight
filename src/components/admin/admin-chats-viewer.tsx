"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Plus, Search, Settings, Users } from "lucide-react";

import { ChatWindow, type ChatMessage } from "@/components/chat/chat-window";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewConversationModal } from "@/components/admin/new-conversation-modal";
import { ManageChatModal } from "@/components/admin/manage-chat-modal";
import { useMediaQuery } from "@/lib/use-media-query";
import { useMobileThreadViewport } from "@/lib/use-mobile-thread-viewport";
import { MESSAGE_PAGE_SIZE, type ChattableContact, type ConversationSummary } from "@/lib/chat-types";
import { createClient } from "@/lib/supabase/client";

interface AdminChatsViewerProps {
  currentUserId: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function preview(c: ConversationSummary): string {
  if (!c.lastMessage) return "No messages yet";
  if (c.lastMessage.body) return c.lastMessage.body;
  if (c.lastMessage.fileName) return `📎 ${c.lastMessage.fileName}`;
  return "Attachment";
}

export function AdminChatsViewer({ currentUserId }: AdminChatsViewerProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedConversationId = searchParams.get("c");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [contacts, setContacts] = useState<ChattableContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(requestedConversationId);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const threadOverlayRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [convRes, contactsRes] = await Promise.all([
      fetch(`/api/admin/conversations?t=${Date.now()}`, { cache: "no-store" }),
      fetch("/api/chat/contacts", { cache: "no-store" }),
    ]);
    const [c, k] = await Promise.all([
      convRes.json().catch(() => ({})),
      contactsRes.json().catch(() => ({})),
    ]);
    // A transient 500 or expired session should leave the last-good list on
    // screen rather than blanking it — there's no refresh affordance here.
    if (convRes.ok) setConversations((c.conversations as ConversationSummary[]) ?? []);
    if (contactsRes.ok) setContacts((k.contacts as ChattableContact[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const syncThreadFromHistory = () => {
      setActiveId(new URLSearchParams(window.location.search).get("c"));
    };
    window.addEventListener("popstate", syncThreadFromHistory);
    return () => window.removeEventListener("popstate", syncThreadFromHistory);
  }, []);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  useMobileThreadViewport(isMobile && Boolean(activeId), threadOverlayRef);

  const openConversation = (id: string) => {
    setActiveId(id);
    window.history.pushState({ insightThread: true }, "", `${pathname}?c=${encodeURIComponent(id)}`);
  };

  const closeConversation = () => {
    if (window.history.state?.insightThread) {
      window.history.back();
      return;
    }
    setActiveId(null);
    router.replace(pathname, { scroll: false });
  };

  // This list holds every conversation in the academy — the largest in the app —
  // so it needs to be searchable by chat name or by who's in it.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.members.some((m) => m.full_name.toLowerCase().includes(q)),
    );
  }, [conversations, search]);

  const showList = !isMobile || !activeId;
  const showThread = !isMobile || Boolean(activeId);

  return (
    <section
      className={isMobile ? "bg-surface" : "border border-border bg-surface"}
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "320px 1fr",
        borderRadius: isMobile ? 0 : "12px",
        overflow: "hidden",
        height: isMobile
          ? "calc(100dvh - 60px - 64px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))"
          : "calc(100dvh - 13rem)",
        minHeight: isMobile ? "420px" : undefined,
      }}
    >
      {showList && (
        <div style={{ display: "flex", flexDirection: "column", borderRight: isMobile ? "none" : "1px solid var(--color-border)", minHeight: 0, minWidth: 0 }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
              <div style={{ minWidth: 0 }}>
                <p className="text-base font-semibold text-navy">All chats</p>
                <p className="text-xs text-muted">Every conversation in the academy.</p>
              </div>
              <Button size="sm" onClick={() => setShowNew(true)} style={{ flexShrink: 0 }}>
                <Plus style={{ height: "16px", width: "16px", marginRight: "6px" }} />
                New
              </Button>
            </div>
            <div style={{ position: "relative" }}>
              <Search
                size={15}
                style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }}
              />
              <Input
                placeholder="Search chats or people"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: "32px" }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {loading ? (
              <p className="text-sm text-muted" style={{ padding: "16px" }}>Loading chats…</p>
            ) : visible.length === 0 ? (
              <p className="text-sm text-muted" style={{ padding: "16px" }}>
                {search.trim() ? "No chats match that search." : "No conversations yet."}
              </p>
            ) : (
              visible.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openConversation(c.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 16px",
                      border: "none",
                      borderBottom: "1px solid var(--color-border)",
                      background: isActive ? "var(--color-soft)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--color-accent-soft)",
                        color: "var(--color-navy)",
                        fontWeight: 700,
                        fontSize: "14px",
                      }}
                    >
                      {c.isGroup ? <Users size={18} /> : initials(c.title)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p className="text-sm font-semibold text-navy" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.title}
                      </p>
                      <p className="text-xs text-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.isGroup ? `${c.members.length} members · ` : ""}
                        {preview(c)}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {showThread && (
        <div
          ref={isMobile ? threadOverlayRef : undefined}
          style={isMobile
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                height: "100dvh",
                zIndex: 80,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                minWidth: 0,
                background: "var(--color-surface)",
                overscrollBehavior: "none",
                touchAction: "pan-y",
              }
            : { display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}
        >
          {active ? (
            <AdminThread
              key={active.id}
              conversation={active}
              currentUserId={currentUserId}
              onManage={() => setShowManage(true)}
              onBack={isMobile ? closeConversation : undefined}
              fullScreen={isMobile}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
              <p className="text-sm text-muted" style={{ textAlign: "center" }}>Select a chat to read it.</p>
            </div>
          )}
        </div>
      )}

      {showNew && (
        <NewConversationModal
          contacts={contacts}
          onClose={() => setShowNew(false)}
          onCreated={async (id) => {
            setShowNew(false);
            await load();
            openConversation(id);
          }}
        />
      )}

      {showManage && active && (
        <ManageChatModal
          conversation={active}
          contacts={contacts}
          onClose={() => setShowManage(false)}
          onChanged={async () => {
            setShowManage(false);
            await load();
          }}
          onDeleted={(id) => {
            // Optimistically drop the row so deleting feels instant, then
            // reconcile with the server.
            setConversations((prev) => prev.filter((c) => c.id !== id));
            setShowManage(false);
            closeConversation();
            void load();
          }}
        />
      )}
    </section>
  );
}

function AdminThread({
  conversation,
  currentUserId,
  onManage,
  onBack,
  fullScreen = false,
}: {
  conversation: ConversationSummary;
  currentUserId: string;
  onManage: () => void;
  onBack?: () => void;
  fullScreen?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [initial, setInitial] = useState<ChatMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, body, created_at, sender_id, file_url, file_name, file_type, sender:sender_id (id, full_name)")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);
      if (cancelled) return;
      const msgs = (data ?? [])
        .reverse()
        .map((m) => ({ ...m, sender: Array.isArray(m.sender) ? m.sender[0] : m.sender }) as ChatMessage);
      setInitial(msgs);
      setHasMore((data ?? []).length === MESSAGE_PAGE_SIZE);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, conversation.id]);

  const subtitle = conversation.isGroup ? conversation.members.map((m) => m.full_name.split(" ")[0]).join(", ") : null;

  // The admin is not a participant in conversations they create, so most threads
  // are read-only to them. Their own DMs are the exception — people can message
  // an admin directly, and this is the only surface where those can be answered.
  const isMember = conversation.members.some((m) => m.id === currentUserId);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, height: "100%" }}>
      {onBack && fullScreen && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            minHeight: "60px",
            padding: "calc(8px + env(safe-area-inset-top, 0px)) 8px 8px",
            borderBottom: "1px solid var(--color-border)",
            background: "color-mix(in oklab, var(--color-surface) 94%, transparent)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to all chats"
            style={{ width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, border: 0, borderRadius: "50%", background: "transparent", color: "var(--color-navy)", cursor: "pointer" }}
          >
            <ChevronLeft size={24} />
          </button>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "var(--color-accent-soft)", color: "var(--color-navy)", fontWeight: 700, fontSize: "13px" }}>
            {conversation.isGroup ? <Users size={18} /> : initials(conversation.title)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="text-sm font-semibold text-navy" style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conversation.title}</p>
            <p className="text-xs text-muted" style={{ margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {conversation.members.length} {conversation.members.length === 1 ? "member" : "members"}
            </p>
          </div>
          <button
            type="button"
            onClick={onManage}
            aria-label="Manage conversation"
            style={{ width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, border: 0, borderRadius: "50%", background: "transparent", color: "var(--color-navy)", cursor: "pointer" }}
          >
            <Settings size={20} />
          </button>
        </header>
      )}
      {initial === null ? (
        <p className="text-sm text-muted" style={{ padding: "16px" }}>Loading messages…</p>
      ) : (
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {!fullScreen && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                padding: "8px 14px",
                borderBottom: "1px solid var(--color-border)",
                flexShrink: 0,
              }}
            >
              <p className="text-xs text-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {conversation.members.length} {conversation.members.length === 1 ? "member" : "members"}
              </p>
              <Button variant="outline" size="sm" onClick={onManage} style={{ flexShrink: 0 }}>
                <Settings size={15} style={{ marginRight: "6px" }} /> Manage
              </Button>
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
            <ChatWindow
              conversationId={conversation.id}
              currentUserId={currentUserId}
              title={conversation.isGroup ? `${conversation.title}${subtitle ? ` · ${subtitle}` : ""}` : conversation.title}
              initialMessages={initial}
              initialHasMore={hasMore}
              readOnly={!isMember}
              fill
              hideHeader={fullScreen}
              showSenderNames={conversation.isGroup}
            />
          </div>
          {!isMember && (
            <p
              className="text-xs text-muted"
              style={{ padding: fullScreen ? "10px 14px calc(10px + env(safe-area-inset-bottom, 0px))" : "10px 14px", borderTop: "1px solid var(--color-border)", flexShrink: 0, textAlign: "center" }}
            >
              You&apos;re not in this chat — view only.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
