"use client";

import { type CSSProperties, type FormEvent, useMemo, useState } from "react";

export type CoopLobbyView = "choose" | "host" | "join";
export type CoopLobbyPhase = "idle" | "creating" | "waiting" | "connecting" | "ready" | "error";

export type CoopPlayerSlot = {
  name: string;
  pant: string;
  accent?: string;
  ready?: boolean;
  connected?: boolean;
};

export type CoopLobbyProps = {
  view: CoopLobbyView;
  phase: CoopLobbyPhase;
  roomCode: string;
  inviteUrl: string;
  message: string;
  host: CoopPlayerSlot;
  guest?: CoopPlayerSlot | null;
  canStart: boolean;
  onClose: () => void;
  onChoose: (view: Exclude<CoopLobbyView, "choose">) => void;
  onCreate: () => void;
  onJoin: (roomLinkOrCode: string) => void;
  onCopy: (fragmentInviteUrl: string) => void;
  onShare: (fragmentInviteUrl: string) => void;
  onStart: () => void;
  onCancel: () => void;
};

const PHASE_LABELS: Record<CoopLobbyPhase, string> = {
  idle: "PRIVATE LINK READY",
  creating: "OPENING ROOM",
  waiting: "WAITING FOR PARTNER",
  connecting: "LINKING FIGHTERS",
  ready: "SQUAD READY",
  error: "LINK INTERRUPTED",
};

function toFragmentInviteUrl(inviteUrl: string) {
  // The fragment contains the one-use guest credential. Preserve the full URL.
  return inviteUrl.trim();
}

function PlayerSlot({ slot, role, empty = false }: { slot?: CoopPlayerSlot | null; role: "HOST" | "GUEST"; empty?: boolean }) {
  const connected = Boolean(slot && (slot.connected ?? true));
  const ready = Boolean(connected && slot?.ready);
  const style = { "--slot-accent": slot?.accent ?? "var(--pant-accent)" } as CSSProperties;

  return (
    <div className={`coop-player-slot ${empty || !connected ? "is-empty" : ""}`} style={style}>
      <span className="coop-slot-mark" aria-hidden="true">{role === "HOST" ? "01" : "02"}</span>
      <span className="coop-slot-copy">
        <small>{role}</small>
        <strong>{connected ? slot?.name : "INVITE OPEN"}</strong>
        <span>{connected ? slot?.pant : "AWAITING FIGHTER"}</span>
      </span>
      <span className={`coop-ready-tag ${ready ? "is-ready" : ""}`}>
        <i aria-hidden="true" />{ready ? "READY" : connected ? "LINKED" : "OPEN"}
      </span>
    </div>
  );
}

export default function CoopLobby({
  view,
  phase,
  roomCode,
  inviteUrl,
  message,
  host,
  guest,
  canStart,
  onClose,
  onChoose,
  onCreate,
  onJoin,
  onCopy,
  onShare,
  onStart,
  onCancel,
}: CoopLobbyProps) {
  const [joinText, setJoinText] = useState(inviteUrl || roomCode);
  const fragmentInviteUrl = useMemo(() => toFragmentInviteUrl(inviteUrl), [inviteUrl]);
  const busy = phase === "creating" || phase === "connecting";
  const roomIsOpen = phase === "waiting" || phase === "ready";
  const joined = view === "join" && phase === "ready";
  const statusCopy = message || (phase === "error"
    ? "The room could not connect. Check the code and try again."
    : view === "host" && phase === "waiting"
      ? "Your room is live. Send the link to your second fighter."
      : view === "join" && phase === "connecting"
        ? "Finding the host and syncing the block…"
        : "Both fighters keep their own pants ability. The squad shares one score.");

  const submitJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = joinText.trim();
    if (normalized && !busy) onJoin(normalized);
  };

  const createRoom = () => {
    onChoose("host");
    onCreate();
  };

  return (
    <div className="coop-backdrop" role="presentation">
      <section
        className="coop-panel cut-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coop-lobby-title"
        aria-describedby="coop-lobby-description"
        data-view={view}
        data-phase={phase}
      >
        <button type="button" className="coop-close" onClick={onClose} aria-label="Close co-op lobby">×</button>

        <header className="coop-panel-header">
          <p className="coop-kicker"><i aria-hidden="true" /> AESTRA LINK // DUO</p>
          <h2 id="coop-lobby-title">CO-OP <span>STRIKE</span></h2>
          <p id="coop-lobby-description">Two fighters. One block. A meaner street built for a squad.</p>
        </header>

        <div className="coop-difficulty" aria-label="Co-op difficulty changes">
          <span>MORE ENEMIES</span><span>TOUGHER ELITES</span><span>SHARED SCORE</span>
        </div>

        {view === "choose" && (
          <div className="coop-choice-grid">
            <button type="button" className="coop-choice" onClick={createRoom} disabled={busy}>
              <span className="coop-choice-index">01</span>
              <strong>CREATE ROOM</strong>
              <small>Open a private link and invite your second fighter.</small>
              <b aria-hidden="true">HOST →</b>
            </button>
            <button type="button" className="coop-choice" onClick={() => onChoose("join")} disabled={busy}>
              <span className="coop-choice-index">02</span>
              <strong>JOIN ROOM</strong>
              <small>Paste the private invite link sent by the host.</small>
              <b aria-hidden="true">JOIN →</b>
            </button>
          </div>
        )}

        {view === "host" && (
          <div className="coop-room-view">
            <div className="coop-status" data-phase={phase} role="status" aria-live="polite">
              <span><i aria-hidden="true" />{PHASE_LABELS[phase]}</span>
              {roomCode && <strong>{roomCode.toUpperCase()}</strong>}
            </div>

            <div className="coop-roster" aria-label="Co-op fighters">
              <PlayerSlot role="HOST" slot={host} />
              <PlayerSlot role="GUEST" slot={guest} empty={!guest} />
            </div>

            {roomIsOpen && fragmentInviteUrl && (
              <div className="coop-invite-block">
                <label htmlFor="coop-invite-url">PRIVATE INVITE</label>
                <div className="coop-invite-row">
                  <input
                    id="coop-invite-url"
                    className="coop-invite-url"
                    value={fragmentInviteUrl}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                    aria-describedby="coop-manual-copy"
                  />
                  <button type="button" className="coop-mini-button" onClick={() => onCopy(fragmentInviteUrl)}>COPY</button>
                </div>
                <button type="button" className="coop-share-button" onClick={() => onShare(fragmentInviteUrl)}>SHARE INVITE</button>
                <small id="coop-manual-copy">If sharing is blocked, press and hold the link to copy it.</small>
              </div>
            )}

            {phase === "idle" && (
              <button type="button" className="coop-primary-button" onClick={onCreate}>CREATE PRIVATE ROOM</button>
            )}
            {phase === "error" && (
              <button type="button" className="coop-primary-button" onClick={onCreate}>TRY AGAIN</button>
            )}
            {roomIsOpen && (
              <button type="button" className="coop-primary-button" onClick={onStart} disabled={!canStart}>
                {canStart ? "START DUO RUN" : "WAITING FOR FIGHTER"}
              </button>
            )}
            {busy && <button type="button" className="coop-primary-button" disabled>{PHASE_LABELS[phase]}…</button>}
          </div>
        )}

        {view === "join" && !joined && (
          <form className="coop-join-form" onSubmit={submitJoin}>
            <label htmlFor="coop-room-entry">PRIVATE INVITE LINK</label>
            <input
              id="coop-room-entry"
              value={joinText}
              onChange={(event) => setJoinText(event.target.value)}
              placeholder="Paste the #coop invite link"
              autoCapitalize="off"
              autoComplete="off"
              enterKeyHint="go"
              spellCheck={false}
              maxLength={480}
              autoFocus
            />
            <p>Invite links open here automatically. The private link includes the key required to join.</p>
            <button type="submit" className="coop-primary-button" disabled={!joinText.trim() || busy}>
              {busy ? `${PHASE_LABELS[phase]}…` : phase === "error" ? "TRY LINK AGAIN" : "JOIN THE SQUAD"}
            </button>
          </form>
        )}

        {joined && (
          <div className="coop-room-view">
            <div className="coop-status" data-phase="ready" role="status" aria-live="polite">
              <span><i aria-hidden="true" />LINKED TO HOST</span>
              {roomCode && <strong>{roomCode.toUpperCase()}</strong>}
            </div>
            <div className="coop-roster" aria-label="Co-op fighters">
              <PlayerSlot role="HOST" slot={host} />
              <PlayerSlot role="GUEST" slot={guest} empty={!guest} />
            </div>
            <div className="coop-guest-wait"><i aria-hidden="true" /><strong>LOADOUT LOCKED</strong><span>The host will launch the run.</span></div>
          </div>
        )}

        <p className={`coop-message ${phase === "error" ? "is-error" : ""}`} role="status" aria-live="polite">{statusCopy}</p>

        {view !== "choose" && (
          <button type="button" className="coop-cancel-button" onClick={onCancel}>
            {roomIsOpen || joined ? "LEAVE ROOM" : "BACK TO MODE SELECT"}
          </button>
        )}
      </section>
    </div>
  );
}
