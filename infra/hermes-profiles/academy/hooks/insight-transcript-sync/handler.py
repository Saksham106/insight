"""Non-blocking, privacy-minimized WhatsApp transcript sync for Insight."""

import asyncio
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import urllib.request
from urllib.parse import urlparse
import uuid


ENABLED_ENV = "INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED"
URL_ENV = "INSIGHT_HERMES_TRANSCRIPT_URL"
SECRET_ENV = "HERMES_TOOL_SHARED_SECRET"
MAX_BATCH_SIZE = 100
MAX_TEXT_LENGTH = 65_536
SILENT_TOKENS = {"[silent]", "silent", "no_reply", "no reply"}

_BACKGROUND_TASKS = set()
_SESSION_LOCKS = {}
_DEFAULT_CURSOR_STORE = None


def sync_enabled(env):
    """Return true only for an explicit, recognizable enabled value."""
    return str(env.get(ENABLED_ENV, "")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _configuration_available():
    if not sync_enabled(os.environ):
        return False
    url = os.environ.get(URL_ENV, "").strip()
    secret = os.environ.get(SECRET_ENV, "")
    if not url or not secret:
        return False
    parsed = urlparse(url)
    return parsed.scheme == "https" or (
        parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}
    )


def _normalize_user_id(value):
    candidate = str(value or "").strip()
    if not re.fullmatch(r"\+?\d{8,15}", candidate):
        return None
    return candidate.lstrip("+")


def visible_text(row):
    """Extract only user-visible text, never tool/media/internal structures."""
    if row.get("role") == "assistant" and row.get("tool_calls"):
        return None
    content = row.get("content")
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        parts = []
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") not in {"text", "input_text", "output_text"}:
                continue
            if isinstance(part.get("text"), str):
                parts.append(part["text"])
        text = "\n".join(parts)
    else:
        return None
    text = text.strip()
    if (
        not text
        or len(text) > MAX_TEXT_LENGTH
        or text.casefold() in SILENT_TOKENS
    ):
        return None
    return text


def _iso_timestamp(value):
    try:
        numeric = float(value)
        moment = datetime.fromtimestamp(numeric, tz=timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        return None
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def to_transcript_message(row):
    """Project a Hermes DB row into the exact public transcript contract."""
    role = row.get("role")
    if role not in {"user", "assistant"}:
        return None
    try:
        message_id = int(row.get("id"))
    except (TypeError, ValueError):
        return None
    if message_id <= 0:
        return None
    text = visible_text(row)
    occurred_at = _iso_timestamp(row.get("timestamp"))
    if text is None or occurred_at is None:
        return None
    return {
        "messageId": message_id,
        "speaker": "contact" if role == "user" else "kitty",
        "text": text,
        "occurredAt": occurred_at,
    }


def sign_body(raw_body, timestamp, request_id, secret):
    """Match Insight's HMAC over timestamp.requestId.rawBody exactly."""
    prefix = f"{timestamp}.{request_id}.".encode("utf-8")
    return hmac.new(
        secret.encode("utf-8"),
        prefix + raw_body,
        hashlib.sha256,
    ).hexdigest()


class CursorStore:
    """Durable per-session high-water marks with atomic file replacement."""

    def __init__(self, path):
        self.path = Path(path)
        self._lock = asyncio.Lock()

    def _read(self):
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {}
        if not isinstance(value, dict):
            return {}
        return {
            str(key): int(cursor)
            for key, cursor in value.items()
            if isinstance(cursor, int) and cursor >= 0
        }

    async def get(self, session_id):
        async with self._lock:
            return self._read().get(session_id, 0)

    async def set(self, session_id, message_id):
        async with self._lock:
            cursors = self._read()
            cursors[session_id] = max(cursors.get(session_id, 0), int(message_id))
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix(self.path.suffix + ".tmp")
            temporary.write_text(
                json.dumps(cursors, sort_keys=True, separators=(",", ":")),
                encoding="utf-8",
            )
            os.replace(temporary, self.path)


def _hermes_home():
    from hermes_cli.config import get_hermes_home

    return get_hermes_home()


def _cursor_store():
    global _DEFAULT_CURSOR_STORE
    if _DEFAULT_CURSOR_STORE is None:
        _DEFAULT_CURSOR_STORE = CursorStore(
            _hermes_home() / "transcript-sync-cursors.json"
        )
    return _DEFAULT_CURSOR_STORE


def _load_new_rows_blocking(session_id, after_id):
    from hermes_state import SessionDB

    database = SessionDB(_hermes_home() / "state.db", read_only=True)
    try:
        return [
            row
            for row in database.get_messages(session_id)
            if isinstance(row.get("id"), int) and row["id"] > after_id
        ]
    finally:
        database.close()


async def _load_new_rows(session_id, after_id):
    return await asyncio.to_thread(
        _load_new_rows_blocking,
        session_id,
        after_id,
    )


def _post_batch_blocking(session_id, user_id, messages):
    url = os.environ[URL_ENV].strip()
    secret = os.environ[SECRET_ENV]
    body = json.dumps(
        {
            "sessionId": session_id,
            "whatsappUserId": user_id,
            "messages": messages,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    timestamp = str(int(datetime.now(tz=timezone.utc).timestamp() * 1000))
    request_id = uuid.uuid4().hex
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "content-type": "application/json",
            "x-hermes-timestamp": timestamp,
            "x-hermes-request-id": request_id,
            "x-hermes-signature": sign_body(
                body,
                timestamp,
                request_id,
                secret,
            ),
        },
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        result = json.loads(response.read(16_384).decode("utf-8"))
    expected = messages[-1]["messageId"]
    if (
        not isinstance(result, dict)
        or result.get("ok") is not True
        or result.get("highestMessageId") != expected
    ):
        raise RuntimeError("invalid transcript sync acknowledgement")
    return expected


async def _post_batch(session_id, user_id, messages):
    return await asyncio.to_thread(
        _post_batch_blocking,
        session_id,
        user_id,
        messages,
    )


async def sync_session(
    session_id,
    user_id,
    *,
    store=None,
    load_rows=None,
    post_batch=None,
):
    """Send only unseen visible rows and commit the cursor after each ack."""
    normalized_user_id = _normalize_user_id(user_id)
    if (
        not isinstance(session_id, str)
        or not 1 <= len(session_id) <= 128
        or any(ord(char) < 32 or ord(char) == 127 for char in session_id)
        or normalized_user_id is None
    ):
        return 0
    store = store or _cursor_store()
    load_rows = load_rows or _load_new_rows
    post_batch = post_batch or _post_batch
    lock = _SESSION_LOCKS.setdefault(session_id, asyncio.Lock())

    async with lock:
        cursor = await store.get(session_id)
        rows = await load_rows(session_id, cursor)
        rows = sorted(
            (row for row in rows if isinstance(row.get("id"), int)),
            key=lambda row: row["id"],
        )
        if not rows:
            return 0

        messages = [
            message
            for row in rows
            if (message := to_transcript_message(row)) is not None
        ]
        sent = 0
        for start in range(0, len(messages), MAX_BATCH_SIZE):
            batch = messages[start : start + MAX_BATCH_SIZE]
            acknowledged = await post_batch(
                session_id,
                normalized_user_id,
                batch,
            )
            if acknowledged != batch[-1]["messageId"]:
                raise RuntimeError("invalid transcript sync acknowledgement")
            await store.set(session_id, acknowledged)
            sent += len(batch)

        scanned_highest = rows[-1]["id"]
        await store.set(session_id, scanned_highest)
        return sent


def _list_whatsapp_sessions_blocking():
    from hermes_state import SessionDB

    database = SessionDB(_hermes_home() / "state.db", read_only=True)
    try:
        sessions = []
        offset = 0
        while True:
            page = database.list_sessions_rich(
                source="whatsapp_cloud",
                limit=200,
                offset=offset,
                include_children=True,
                project_compression_tips=False,
                include_archived=True,
                compact_rows=True,
            )
            sessions.extend(page)
            if len(page) < 200:
                return sessions
            offset += len(page)
    finally:
        database.close()


async def _sync_all_sessions():
    sessions = await asyncio.to_thread(_list_whatsapp_sessions_blocking)
    for session in sessions:
        session_id = session.get("id")
        user_id = session.get("user_id")
        try:
            await sync_session(session_id, user_id)
        except Exception as error:
            print(
                "[insight-transcript-sync] startup session failed: "
                f"{type(error).__name__}",
                flush=True,
            )


async def _delayed_sync(session_id, user_id):
    await asyncio.sleep(0.25)
    await sync_session(session_id, user_id)


def _task_done(task):
    _BACKGROUND_TASKS.discard(task)
    try:
        error = task.exception()
    except asyncio.CancelledError:
        return
    if error is not None:
        print(
            "[insight-transcript-sync] background sync failed: "
            f"{type(error).__name__}",
            flush=True,
        )


def _schedule(coroutine):
    task = asyncio.get_running_loop().create_task(coroutine)
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_task_done)


def handle(event_type, context):
    """Schedule transcript sync without awaiting database or network work."""
    if not _configuration_available():
        return None
    if event_type == "agent:end":
        if context.get("platform") != "whatsapp_cloud":
            return None
        session_id = context.get("session_id")
        user_id = _normalize_user_id(context.get("user_id"))
        if not isinstance(session_id, str) or user_id is None:
            return None
        _schedule(_delayed_sync(session_id, user_id))
    elif event_type == "gateway:startup":
        _schedule(_sync_all_sessions())
    return None
