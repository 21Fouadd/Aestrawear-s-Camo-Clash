export const COOP_PROTOCOL_VERSION = 1;
export const COOP_BUILD_ID = "camo-clash-coop-1";

export type CoopRole = "host" | "guest";
export type CoopConnectionStatus = "waiting" | "connecting" | "connected" | "closed";
export type CoopMessage = Record<string, unknown>;

export type CoopInvite = {
  roomId: string;
  inviteToken: string;
};

export type CoopConnectionHandlers = {
  onOpen?: () => void;
  onControl?: (message: CoopMessage) => void;
  onState?: (message: CoopMessage) => void;
  onStatus?: (status: CoopConnectionStatus) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
};

type SignalKind = "description" | "candidate" | "ready" | "connected" | "bye";
type SignalMessage = { kind: SignalKind; payload: unknown };
type SignalEnvelope = { id: number; sender: CoopRole; kind: SignalKind; payload: unknown };

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STATE_BUFFER_LIMIT = 512 * 1024;
const CONTROL_BUFFER_LIMIT = 1024 * 1024;
const MAX_DATA_MESSAGE = 768 * 1024;

function isRecord(value: unknown): value is CoopMessage {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeInviteText(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed, typeof window === "undefined" ? "https://localhost/" : window.location.href);
    return url.hash.startsWith("#coop=") ? url.hash.slice(6) : trimmed.replace(/^#coop=/, "");
  } catch {
    return trimmed.replace(/^#coop=/, "");
  }
}

export function parseCoopInvite(input: string): CoopInvite | null {
  const normalized = normalizeInviteText(input);
  const separator = normalized.indexOf(".");
  if (separator < 0) return null;
  const roomId = normalized.slice(0, separator);
  const inviteToken = normalized.slice(separator + 1);
  if (!ROOM_ID_PATTERN.test(roomId) || !TOKEN_PATTERN.test(inviteToken)) return null;
  return { roomId, inviteToken };
}

export function buildCoopInviteUrl(roomId: string, inviteToken: string) {
  if (!ROOM_ID_PATTERN.test(roomId) || !TOKEN_PATTERN.test(inviteToken)) return "";
  if (typeof window === "undefined") return `#coop=${roomId}.${inviteToken}`;
  return `${window.location.origin}${window.location.pathname}#coop=${roomId}.${inviteToken}`;
}

async function readJson(response: Response) {
  const value = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const message = isRecord(value) && typeof value.error === "string" ? value.error : "The co-op room could not connect.";
    throw new Error(message);
  }
  if (!isRecord(value)) throw new Error("The co-op server returned an invalid response.");
  return value;
}

export class CoopConnection {
  readonly role: CoopRole;
  readonly roomId: string;
  readonly expiresAt: number;

  private readonly token: string;
  private readonly handlers: CoopConnectionHandlers;
  private peer: RTCPeerConnection | null = null;
  private control: RTCDataChannel | null = null;
  private state: RTCDataChannel | null = null;
  private cursor = 0;
  private clientSeq = 1;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private opened = false;
  private remoteDescriptionSet = false;
  private localDescriptionQueued = false;
  private pollFailures = 0;
  private signalChain = Promise.resolve();
  private pendingLocalCandidates: Array<RTCIceCandidateInit | null> = [];
  private pendingRemoteCandidates: Array<RTCIceCandidateInit | null> = [];

  constructor(role: CoopRole, roomId: string, token: string, expiresAt: number, handlers: CoopConnectionHandlers) {
    this.role = role;
    this.roomId = roomId;
    this.token = token;
    this.expiresAt = expiresAt;
    this.handlers = handlers;
  }

  async start() {
    if (this.peer || this.closed) return;
    if (typeof RTCPeerConnection === "undefined") throw new Error("This browser does not support online co-op.");
    this.peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      bundlePolicy: "max-bundle",
    });
    this.peer.onicecandidate = (event) => {
      const candidate = event.candidate?.toJSON() ?? null;
      if (!this.localDescriptionQueued) this.pendingLocalCandidates.push(candidate);
      else this.queueSignal({ kind: "candidate", payload: candidate });
    };
    this.peer.onconnectionstatechange = () => this.handlePeerState();

    if (this.role === "host") {
      this.attachChannel(this.peer.createDataChannel("control", { ordered: true }), "control");
      this.attachChannel(this.peer.createDataChannel("state", { ordered: false, maxRetransmits: 0 }), "state");
      this.handlers.onStatus?.("waiting");
      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(offer);
      this.queueLocalDescription();
    } else {
      this.peer.ondatachannel = (event) => {
        if (event.channel.label === "control") this.attachChannel(event.channel, "control");
        if (event.channel.label === "state") this.attachChannel(event.channel, "state");
      };
      this.handlers.onStatus?.("connecting");
      this.armConnectTimeout();
      this.queueSignal({ kind: "ready", payload: null });
    }
    this.schedulePoll(0);
  }

  sendControl(message: CoopMessage) {
    return this.send(this.control, message, CONTROL_BUFFER_LIMIT);
  }

  sendState(message: CoopMessage) {
    return this.send(this.state, message, STATE_BUFFER_LIMIT);
  }

  async close(removeRoom = this.role === "host") {
    if (this.closed) return;
    this.closed = true;
    this.handlers.onStatus?.("closed");
    this.clearTimers();
    try {
      await this.postSignals([{ kind: "bye", payload: null }], this.clientSeq++);
    } catch {
      // Closing is best effort; the room also expires automatically.
    }
    try { this.control?.close(); } catch { /* no-op */ }
    try { this.state?.close(); } catch { /* no-op */ }
    try { this.peer?.close(); } catch { /* no-op */ }
    this.peer = null;
    if (removeRoom) {
      void fetch(`/api/coop/rooms?roomId=${encodeURIComponent(this.roomId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.token}` },
      }).catch(() => undefined);
    }
  }

  private attachChannel(channel: RTCDataChannel, kind: "control" | "state") {
    channel.binaryType = "arraybuffer";
    if (kind === "control") this.control = channel;
    else this.state = channel;
    channel.onopen = () => this.maybeOpen();
    channel.onclose = () => {
      if (!this.closed && this.opened) this.handlers.onClose?.();
    };
    channel.onerror = () => this.fail("The direct co-op link was interrupted.");
    channel.onmessage = (event) => {
      if (typeof event.data !== "string" || event.data.length > MAX_DATA_MESSAGE) return;
      try {
        const parsed = JSON.parse(event.data) as unknown;
        if (!isRecord(parsed)) return;
        if (kind === "control") this.handlers.onControl?.(parsed);
        else this.handlers.onState?.(parsed);
      } catch {
        // Ignore malformed peer data without taking down the run.
      }
    };
  }

  private send(channel: RTCDataChannel | null, message: CoopMessage, bufferLimit: number) {
    if (!channel || channel.readyState !== "open" || channel.bufferedAmount > bufferLimit) return false;
    try {
      const serialized = JSON.stringify(message);
      if (serialized.length > MAX_DATA_MESSAGE) return false;
      channel.send(serialized);
      return true;
    } catch {
      return false;
    }
  }

  private maybeOpen() {
    if (this.opened || this.control?.readyState !== "open" || this.state?.readyState !== "open") return;
    this.opened = true;
    this.clearConnectTimeout();
    this.handlers.onStatus?.("connected");
    this.handlers.onOpen?.();
    this.queueSignal({ kind: "connected", payload: null });
  }

  private handlePeerState() {
    const connectionState = this.peer?.connectionState;
    if (connectionState === "connected") {
      if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      return;
    }
    if (connectionState === "failed") {
      this.fail("Could not form a direct link. Try the same Wi-Fi network or another connection.");
    } else if (connectionState === "disconnected" && !this.disconnectTimer) {
      this.disconnectTimer = setTimeout(() => {
        if (this.peer?.connectionState === "disconnected") this.fail("Your co-op partner disconnected.");
      }, 12_000);
    }
  }

  private queueLocalDescription() {
    const description = this.peer?.localDescription;
    if (!description) return;
    this.queueSignal({ kind: "description", payload: { type: description.type, sdp: description.sdp } });
    this.localDescriptionQueued = true;
    for (const candidate of this.pendingLocalCandidates) this.queueSignal({ kind: "candidate", payload: candidate });
    this.pendingLocalCandidates.length = 0;
  }

  private queueSignal(signal: SignalMessage) {
    const sequence = this.clientSeq++;
    this.signalChain = this.signalChain
      .then(() => this.postSignals([signal], sequence))
      .catch(() => {
        if (!this.closed) this.pollFailures += 1;
      });
  }

  private async postSignals(messages: SignalMessage[], clientSeq: number) {
    const response = await fetch("/api/coop/signals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ roomId: this.roomId, clientSeq, messages }),
    });
    if (!response.ok) throw new Error("signal failed");
  }

  private schedulePoll(delay: number) {
    if (this.closed) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => { void this.poll(); }, delay);
  }

  private async poll() {
    if (this.closed) return;
    try {
      const response = await fetch(`/api/coop/signals?roomId=${encodeURIComponent(this.roomId)}&after=${this.cursor}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${this.token}` },
      });
      const data = await readJson(response);
      this.pollFailures = 0;
      if (typeof data.cursor === "number") this.cursor = data.cursor;
      if (isRecord(data.room) && data.room.guestJoined === true && this.role === "host" && !this.opened) {
        this.handlers.onStatus?.("connecting");
        this.armConnectTimeout();
      }
      if (Array.isArray(data.signals)) {
        for (const value of data.signals) {
          if (isRecord(value) && typeof value.kind === "string") await this.acceptSignal(value as unknown as SignalEnvelope);
        }
      }
      if (!this.opened || (Array.isArray(data.signals) && data.signals.length > 0)) this.schedulePoll(data.hasMore === true ? 0 : 320);
    } catch (cause) {
      this.pollFailures += 1;
      if (this.pollFailures >= 5) {
        this.fail(cause instanceof Error ? cause.message : "The co-op signaling service is unavailable.");
        return;
      }
      this.schedulePoll(Math.min(1800, 320 * (this.pollFailures + 1)));
    }
  }

  private async acceptSignal(signal: SignalEnvelope) {
    if (!this.peer || this.closed) return;
    if (signal.kind === "description" && isRecord(signal.payload)) {
      const type = signal.payload.type;
      const sdp = signal.payload.sdp;
      if ((type !== "offer" && type !== "answer") || typeof sdp !== "string") return;
      await this.peer.setRemoteDescription({ type, sdp });
      this.remoteDescriptionSet = true;
      for (const candidate of this.pendingRemoteCandidates) await this.addRemoteCandidate(candidate);
      this.pendingRemoteCandidates.length = 0;
      if (type === "offer" && this.role === "guest") {
        const answer = await this.peer.createAnswer();
        this.localDescriptionQueued = false;
        await this.peer.setLocalDescription(answer);
        this.queueLocalDescription();
      }
    } else if (signal.kind === "candidate") {
      const candidate = signal.payload === null ? null : isRecord(signal.payload) && typeof signal.payload.candidate === "string"
        ? signal.payload as RTCIceCandidateInit
        : undefined;
      if (candidate === undefined) return;
      if (!this.remoteDescriptionSet) this.pendingRemoteCandidates.push(candidate);
      else await this.addRemoteCandidate(candidate);
    } else if (signal.kind === "bye") {
      this.handlers.onClose?.();
      await this.close(false);
    }
  }

  private async addRemoteCandidate(candidate: RTCIceCandidateInit | null) {
    try { await this.peer?.addIceCandidate(candidate); } catch { /* stale candidates are safe to ignore */ }
  }

  private armConnectTimeout() {
    if (this.connectTimer || this.opened) return;
    this.connectTimer = setTimeout(() => {
      if (!this.opened) this.fail("Connection timed out. Try the same Wi-Fi network or create a new invite.");
    }, 35_000);
  }

  private clearConnectTimeout() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private clearTimers() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.pollTimer = null;
    this.disconnectTimer = null;
    this.clearConnectTimeout();
  }

  private fail(message: string) {
    if (this.closed) return;
    this.handlers.onError?.(message);
    void this.close(false);
  }
}

export async function createCoopRoom(handlers: CoopConnectionHandlers) {
  const response = await fetch("/api/coop/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ protocolVersion: COOP_PROTOCOL_VERSION, buildId: COOP_BUILD_ID }),
  });
  const data = await readJson(response);
  if (
    typeof data.roomId !== "string" || !ROOM_ID_PATTERN.test(data.roomId)
    || typeof data.hostToken !== "string" || !TOKEN_PATTERN.test(data.hostToken)
    || typeof data.guestToken !== "string" || !TOKEN_PATTERN.test(data.guestToken)
    || typeof data.expiresAt !== "number"
  ) throw new Error("The co-op room response was invalid.");
  const connection = new CoopConnection("host", data.roomId, data.hostToken, data.expiresAt, handlers);
  await connection.start();
  return { connection, roomId: data.roomId, inviteToken: data.guestToken, expiresAt: data.expiresAt };
}

export async function joinCoopRoom(invite: CoopInvite, handlers: CoopConnectionHandlers) {
  const response = await fetch("/api/coop/join", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${invite.inviteToken}`,
    },
    body: JSON.stringify({ roomId: invite.roomId, protocolVersion: COOP_PROTOCOL_VERSION, buildId: COOP_BUILD_ID }),
  });
  const data = await readJson(response);
  if (
    typeof data.roomId !== "string" || data.roomId !== invite.roomId
    || typeof data.guestToken !== "string" || !TOKEN_PATTERN.test(data.guestToken)
    || typeof data.expiresAt !== "number"
  ) throw new Error("The co-op join response was invalid.");
  const connection = new CoopConnection("guest", data.roomId, data.guestToken, data.expiresAt, handlers);
  await connection.start();
  return { connection, roomId: data.roomId, expiresAt: data.expiresAt };
}
