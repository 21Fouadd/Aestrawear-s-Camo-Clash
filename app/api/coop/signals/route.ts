import {
  MAX_CANDIDATE_BYTES,
  MAX_CONTROL_BYTES,
  MAX_ROOM_SIGNALS,
  MAX_SDP_BYTES,
  MAX_SIGNAL_BATCH,
  MAX_SIGNAL_BODY_BYTES,
  MAX_SIGNAL_PAGE,
  authorizeRoom,
  byteLength,
  ensureCoopSchema,
  extractBearerToken,
  isRecord,
  isValidRoomId,
  jsonError,
  jsonResponse,
  readJsonObject,
  rejectCrossOrigin,
} from "../_shared";

type SignalKind = "description" | "candidate" | "ready" | "connected" | "bye";

type NormalizedSignal = {
  kind: SignalKind;
  payload: string;
};

type SignalRow = {
  id: number;
  sender: "host" | "guest";
  kind: SignalKind;
  payload: string;
  createdAt: number;
};

type WriteResult = {
  meta: { changes?: number };
};

type NormalizeResult =
  | { ok: true; signal: NormalizedSignal }
  | { ok: false; error: string };

function normalizeSignal(value: unknown): NormalizeResult {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return { ok: false, error: "Each signaling message must be an object with a valid kind" };
  }

  if (value.kind === "description") {
    if (!isRecord(value.payload)) {
      return { ok: false, error: "Description payload is invalid" };
    }
    const { type, sdp } = value.payload;
    if ((type !== "offer" && type !== "answer") || typeof sdp !== "string") {
      return { ok: false, error: "Description must contain an offer or answer SDP" };
    }
    if (
      byteLength(sdp) < 4 ||
      byteLength(sdp) > MAX_SDP_BYTES ||
      (!sdp.startsWith("v=0\r\n") && !sdp.startsWith("v=0\n"))
    ) {
      return { ok: false, error: "Description SDP is malformed or too large" };
    }
    return {
      ok: true,
      signal: { kind: "description", payload: JSON.stringify({ type, sdp }) },
    };
  }

  if (value.kind === "candidate") {
    if (value.payload === null) {
      return { ok: true, signal: { kind: "candidate", payload: "null" } };
    }
    if (!isRecord(value.payload) || typeof value.payload.candidate !== "string") {
      return { ok: false, error: "ICE candidate payload is invalid" };
    }

    const candidate = value.payload.candidate;
    const sdpMid = value.payload.sdpMid;
    const sdpMLineIndex = value.payload.sdpMLineIndex;
    const usernameFragment = value.payload.usernameFragment;
    if (byteLength(candidate) > MAX_CANDIDATE_BYTES) {
      return { ok: false, error: "ICE candidate is too large" };
    }
    if (sdpMid !== undefined && sdpMid !== null && (typeof sdpMid !== "string" || byteLength(sdpMid) > 128)) {
      return { ok: false, error: "ICE candidate media ID is invalid" };
    }
    if (
      sdpMLineIndex !== undefined &&
      sdpMLineIndex !== null &&
      (!Number.isInteger(sdpMLineIndex) || (sdpMLineIndex as number) < 0 || (sdpMLineIndex as number) > 65535)
    ) {
      return { ok: false, error: "ICE candidate media line is invalid" };
    }
    if (
      usernameFragment !== undefined &&
      usernameFragment !== null &&
      (typeof usernameFragment !== "string" || byteLength(usernameFragment) > 256)
    ) {
      return { ok: false, error: "ICE candidate username fragment is invalid" };
    }

    return {
      ok: true,
      signal: {
        kind: "candidate",
        payload: JSON.stringify({
          candidate,
          sdpMid: sdpMid ?? null,
          sdpMLineIndex: sdpMLineIndex ?? null,
          usernameFragment: usernameFragment ?? null,
        }),
      },
    };
  }

  if (value.kind === "ready" || value.kind === "connected" || value.kind === "bye") {
    const payload = value.payload ?? null;
    if (payload !== null && !isRecord(payload)) {
      return { ok: false, error: `${value.kind} payload must be an object or null` };
    }
    const serialized = JSON.stringify(payload);
    if (byteLength(serialized) > MAX_CONTROL_BYTES) {
      return { ok: false, error: `${value.kind} payload is too large` };
    }
    return { ok: true, signal: { kind: value.kind, payload: serialized } };
  }

  return { ok: false, error: "Unsupported signaling message kind" };
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  try {
    const parsed = await readJsonObject(request, MAX_SIGNAL_BODY_BYTES);
    if (!parsed.ok) return parsed.response;

    const { roomId, clientSeq, messages } = parsed.value;
    const token = extractBearerToken(request);
    if (!isValidRoomId(roomId) || !token) return jsonError("Room not found", 404);
    if (
      !Number.isSafeInteger(clientSeq) ||
      (clientSeq as number) < 0 ||
      (clientSeq as number) > 2_147_483_647 ||
      !Array.isArray(messages) ||
      messages.length < 1 ||
      messages.length > MAX_SIGNAL_BATCH ||
      (clientSeq as number) + messages.length - 1 > 2_147_483_647
    ) {
      return jsonError("Invalid signaling batch", 400);
    }

    const normalized: NormalizedSignal[] = [];
    for (const message of messages) {
      const result = normalizeSignal(message);
      if (!result.ok) return jsonError(result.error, 400);
      normalized.push(result.signal);
    }

    const d1 = await ensureCoopSchema();
    const now = Date.now();
    const room = await authorizeRoom(roomId, token, now);
    if (!room) return jsonError("Room not found or expired", 404);

    const reserved = await d1
      .prepare(`UPDATE "coop_rooms"
        SET "signal_count" = "signal_count" + ?1,
            "last_activity_at" = ?2
        WHERE "id" = ?3
          AND "expires_at" > ?2
          AND "signal_count" <= ?4`)
      .bind(normalized.length, now, roomId, MAX_ROOM_SIGNALS - normalized.length)
      .run();

    if ((reserved.meta.changes ?? 0) !== 1) {
      return jsonError("This co-op room has reached its signaling limit", 429);
    }

    let results: WriteResult[];
    try {
      results = await d1.batch(
        normalized.map((signal, index) =>
          d1
            .prepare(`INSERT INTO "coop_signals"
              ("room_id", "sender", "kind", "client_seq", "payload", "created_at")
              VALUES (?1, ?2, ?3, ?4, ?5, ?6)
              ON CONFLICT ("room_id", "sender", "client_seq") DO NOTHING`)
            .bind(roomId, room.role, signal.kind, (clientSeq as number) + index, signal.payload, now),
        ),
      );
    } catch (cause) {
      await d1
        .prepare(`UPDATE "coop_rooms"
          SET "signal_count" = MAX(0, "signal_count" - ?1)
          WHERE "id" = ?2`)
        .bind(normalized.length, roomId)
        .run()
        .catch(() => undefined);
      throw cause;
    }

    const accepted = results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
    const connectedAccepted = results.some(
      (result, index) => (result.meta.changes ?? 0) === 1 && normalized[index].kind === "connected",
    );
    await d1
      .prepare(`UPDATE "coop_rooms"
        SET "signal_count" = MAX(0, "signal_count" - ?1),
            "status" = CASE WHEN ?2 = 1 THEN 'connected' ELSE "status" END
        WHERE "id" = ?3`)
      .bind(normalized.length - accepted, connectedAccepted ? 1 : 0, roomId)
      .run();

    return jsonResponse({ accepted }, { status: 202 });
  } catch (cause) {
    console.error("Co-op signal write failed", cause);
    return jsonError("Co-op signal could not be sent", 500);
  }
}

export async function GET(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  try {
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId");
    const afterRaw = url.searchParams.get("after") ?? "0";
    const token = extractBearerToken(request);
    if (!isValidRoomId(roomId) || !token) return jsonError("Room not found", 404);
    if (!/^\d{1,16}$/.test(afterRaw)) return jsonError("Invalid signaling cursor", 400);
    const after = Number(afterRaw);
    if (!Number.isSafeInteger(after) || after < 0) return jsonError("Invalid signaling cursor", 400);

    const d1 = await ensureCoopSchema();
    const room = await authorizeRoom(roomId, token);
    if (!room) return jsonError("Room not found or expired", 404);

    const result = await d1
      .prepare(`SELECT
        "id", "sender", "kind", "payload", "created_at" AS "createdAt"
      FROM "coop_signals"
      WHERE "room_id" = ?1 AND "sender" <> ?2 AND "id" > ?3
      ORDER BY "id" ASC
      LIMIT ?4`)
      .bind(roomId, room.role, after, MAX_SIGNAL_PAGE + 1)
      .all<SignalRow>();

    const rows = result.results as SignalRow[];
    const hasMore = rows.length > MAX_SIGNAL_PAGE;
    const page = rows.slice(0, MAX_SIGNAL_PAGE);
    const signals = page.map((signal) => ({
      id: signal.id,
      sender: signal.sender,
      kind: signal.kind,
      payload: JSON.parse(signal.payload) as unknown,
      createdAt: signal.createdAt,
    }));
    const cursor = page.length > 0 ? page[page.length - 1].id : after;

    return jsonResponse({
      room: {
        status: room.status,
        protocolVersion: room.protocolVersion,
        buildId: room.buildId,
        guestJoined: room.guestJoinedAt !== null,
        expiresAt: room.expiresAt,
      },
      signals,
      cursor,
      hasMore,
    });
  } catch (cause) {
    console.error("Co-op signal read failed", cause);
    return jsonError("Co-op signals could not be read", 500);
  }
}
