import {
  NO_STORE_HEADERS,
  ROOM_TTL_MS,
  authorizeRoom,
  cleanupExpiredRooms,
  ensureCoopSchema,
  extractBearerToken,
  hashCapability,
  isValidBuildId,
  isValidProtocolVersion,
  isValidRoomId,
  jsonError,
  jsonResponse,
  randomCapability,
  readJsonObject,
  rejectCrossOrigin,
} from "../_shared";

const MAX_CREATE_BODY_BYTES = 2 * 1024;

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  try {
    const parsed = await readJsonObject(request, MAX_CREATE_BODY_BYTES);
    if (!parsed.ok) return parsed.response;

    const { protocolVersion, buildId } = parsed.value;
    if (!isValidProtocolVersion(protocolVersion)) {
      return jsonError("Invalid co-op protocol version", 400);
    }
    if (!isValidBuildId(buildId)) {
      return jsonError("Invalid game build ID", 400);
    }

    const d1 = await ensureCoopSchema();
    const now = Date.now();
    await cleanupExpiredRooms(now);

    const roomId = randomCapability(16);
    const hostToken = randomCapability(32);
    const guestToken = randomCapability(32);
    const [hostTokenHash, guestInviteTokenHash] = await Promise.all([
      hashCapability(hostToken),
      hashCapability(guestToken),
    ]);
    const expiresAt = now + ROOM_TTL_MS;

    await d1
      .prepare(`INSERT INTO "coop_rooms" (
        "id", "host_token_hash", "guest_invite_token_hash", "guest_token_hash",
        "status", "protocol_version", "build_id", "signal_count", "created_at",
        "guest_joined_at", "last_activity_at", "expires_at"
      ) VALUES (?1, ?2, ?3, NULL, 'waiting', ?4, ?5, 0, ?6, NULL, ?6, ?7)`)
      .bind(roomId, hostTokenHash, guestInviteTokenHash, protocolVersion, buildId, now, expiresAt)
      .run();

    return jsonResponse(
      { roomId, hostToken, guestToken, expiresAt },
      { status: 201 },
    );
  } catch (cause) {
    console.error("Co-op room creation failed", cause);
    return jsonError("Co-op room could not be created", 500);
  }
}

export async function DELETE(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  try {
    const roomId = new URL(request.url).searchParams.get("roomId");
    const token = extractBearerToken(request);
    if (!isValidRoomId(roomId) || !token) return jsonError("Room not found", 404);

    const d1 = await ensureCoopSchema();
    const room = await authorizeRoom(roomId, token);
    if (!room || room.role !== "host") return jsonError("Room not found", 404);

    await d1.batch([
      d1.prepare(`DELETE FROM "coop_signals" WHERE "room_id" = ?1`).bind(roomId),
      d1.prepare(`DELETE FROM "coop_rooms" WHERE "id" = ?1`).bind(roomId),
    ]);

    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (cause) {
    console.error("Co-op room deletion failed", cause);
    return jsonError("Co-op room could not be closed", 500);
  }
}
