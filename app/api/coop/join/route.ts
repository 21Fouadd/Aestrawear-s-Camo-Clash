import {
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

const MAX_JOIN_BODY_BYTES = 2 * 1024;

type InviteRoomRow = {
  status: string;
  protocolVersion: number;
  buildId: string;
  guestTokenHash: string | null;
};

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  try {
    const parsed = await readJsonObject(request, MAX_JOIN_BODY_BYTES);
    if (!parsed.ok) return parsed.response;

    const { roomId, protocolVersion, buildId } = parsed.value;
    const inviteToken = extractBearerToken(request);
    if (!isValidRoomId(roomId) || !inviteToken) return jsonError("Room not found", 404);
    if (!isValidProtocolVersion(protocolVersion) || !isValidBuildId(buildId)) {
      return jsonError("Invalid game version", 400);
    }

    const d1 = await ensureCoopSchema();
    const now = Date.now();
    const inviteTokenHash = await hashCapability(inviteToken);
    const guestToken = randomCapability(32);
    const guestTokenHash = await hashCapability(guestToken);

    const claimed = await d1
      .prepare(`UPDATE "coop_rooms"
        SET "guest_token_hash" = ?1,
            "guest_joined_at" = ?2,
            "last_activity_at" = ?2,
            "status" = 'negotiating'
        WHERE "id" = ?3
          AND "guest_invite_token_hash" = ?4
          AND "guest_token_hash" IS NULL
          AND "guest_joined_at" IS NULL
          AND "status" = 'waiting'
          AND "expires_at" > ?2
          AND "protocol_version" = ?5
          AND "build_id" = ?6`)
      .bind(guestTokenHash, now, roomId, inviteTokenHash, protocolVersion, buildId)
      .run();

    if ((claimed.meta.changes ?? 0) !== 1) {
      const room = await d1
        .prepare(`SELECT
          "status",
          "protocol_version" AS "protocolVersion",
          "build_id" AS "buildId",
          "guest_token_hash" AS "guestTokenHash"
        FROM "coop_rooms"
        WHERE "id" = ?1 AND "guest_invite_token_hash" = ?2 AND "expires_at" > ?3`)
        .bind(roomId, inviteTokenHash, now)
        .first<InviteRoomRow>();

      if (!room) return jsonError("Room not found or invite expired", 404);
      if (room.guestTokenHash || room.status !== "waiting") {
        return jsonError("This co-op invite has already been used", 409);
      }
      if (room.protocolVersion !== protocolVersion || room.buildId !== buildId) {
        return jsonError("The players are using different game versions", 409);
      }
      return jsonError("This co-op room is no longer available", 409);
    }

    const room = await d1
      .prepare(`SELECT "expires_at" AS "expiresAt" FROM "coop_rooms" WHERE "id" = ?1`)
      .bind(roomId)
      .first<{ expiresAt: number }>();

    return jsonResponse({
      roomId,
      role: "guest",
      guestToken,
      protocolVersion,
      buildId,
      expiresAt: room?.expiresAt ?? now,
    });
  } catch (cause) {
    console.error("Co-op room join failed", cause);
    return jsonError("Co-op room could not be joined", 500);
  }
}
