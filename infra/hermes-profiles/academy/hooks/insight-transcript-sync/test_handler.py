import asyncio
from datetime import datetime, timezone
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


HOOK_DIR = Path(__file__).parent


def load_handler():
    path = HOOK_DIR / "handler.py"
    spec = importlib.util.spec_from_file_location("insight_transcript_sync", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TranscriptHookContractTests(unittest.TestCase):
    def test_manifest_subscribes_to_turn_end_and_startup(self):
        manifest = (HOOK_DIR / "HOOK.yaml").read_text()
        self.assertIn("- agent:end", manifest)
        self.assertIn("- gateway:startup", manifest)

    def test_feature_flag_defaults_off(self):
        module = load_handler()
        self.assertFalse(module.sync_enabled({}))
        self.assertTrue(module.sync_enabled({
            "INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED": "true",
        }))

    def test_projects_only_visible_contact_and_final_kitty_text(self):
        module = load_handler()
        timestamp = datetime(2026, 7, 27, 14, 30, tzinfo=timezone.utc).timestamp()
        rows = [
            {"id": 1, "role": "system", "content": "secret", "timestamp": timestamp},
            {"id": 2, "role": "developer", "content": "secret", "timestamp": timestamp},
            {"id": 3, "role": "tool", "content": '{"secret":true}', "timestamp": timestamp},
            {
                "id": 4,
                "role": "assistant",
                "content": "Calling a tool",
                "tool_calls": [{"id": "call-1"}],
                "timestamp": timestamp,
            },
            {"id": 5, "role": "assistant", "content": "[SILENT]", "timestamp": timestamp},
            {
                "id": 6,
                "role": "user",
                "content": [{"type": "image", "path": "/private/internal.jpg"}],
                "timestamp": timestamp,
            },
            {
                "id": 7,
                "role": "user",
                "content": "  I will pay tomorrow.  ",
                "reasoning": "ignore this",
                "timestamp": timestamp,
            },
            {
                "id": 8,
                "role": "assistant",
                "content": [{"type": "output_text", "text": "Thank you!"}],
                "reasoning_content": "ignore this",
                "timestamp": timestamp + 1,
            },
        ]
        projected = [
            message
            for row in rows
            if (message := module.to_transcript_message(row)) is not None
        ]
        self.assertEqual(projected, [
            {
                "messageId": 7,
                "speaker": "contact",
                "text": "I will pay tomorrow.",
                "occurredAt": "2026-07-27T14:30:00.000Z",
            },
            {
                "messageId": 8,
                "speaker": "kitty",
                "text": "Thank you!",
                "occurredAt": "2026-07-27T14:30:01.000Z",
            },
        ])
        self.assertNotIn("reasoning", json.dumps(projected).lower())
        self.assertNotIn("internal.jpg", json.dumps(projected))

    def test_signs_the_exact_raw_body(self):
        module = load_handler()
        body = b'{"messages":[{"text":"hello"}]}'
        expected = hmac.new(
            b"shared-secret",
            b"1722090600000.request_id_123." + body,
            hashlib.sha256,
        ).hexdigest()
        self.assertEqual(
            module.sign_body(
                body,
                "1722090600000",
                "request_id_123",
                "shared-secret",
            ),
            expected,
        )


class CursorStoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_cursor_write_is_atomic_and_keeps_highest_value(self):
        module = load_handler()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cursors.json"
            store = module.CursorStore(path)
            await store.set("session-a", 12)
            await store.set("session-a", 9)
            self.assertEqual(await store.get("session-a"), 12)
            self.assertEqual(json.loads(path.read_text()), {"session-a": 12})
            self.assertFalse(path.with_suffix(".json.tmp").exists())

    async def test_seen_delivery_store_is_atomic_and_bounded_to_current_index(self):
        module = load_handler()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "deliveries.json"
            store = module.SeenDeliveryStore(path)
            await store.mark_seen(["wamid.message_one", "wamid.message_two"])
            self.assertEqual(
                await store.unseen(["wamid.message_one", "wamid.message_three"]),
                ["wamid.message_three"],
            )
            await store.retain({"wamid.message_two", "wamid.message_three"})
            self.assertEqual(json.loads(path.read_text()), ["wamid.message_two"])
            self.assertFalse(path.with_suffix(".json.tmp").exists())


class SyncSessionTests(unittest.IsolatedAsyncioTestCase):
    async def test_batches_messages_and_advances_only_after_acknowledgement(self):
        module = load_handler()
        rows = [
            {
                "id": index,
                "role": "user",
                "content": f"message {index}",
                "timestamp": 1_722_090_600 + index,
            }
            for index in range(1, 206)
        ]
        sent = []

        async def load_rows(session_id, after_id):
            self.assertEqual(session_id, "session-a")
            return [row for row in rows if row["id"] > after_id]

        async def post_batch(session_id, user_id, messages):
            sent.append((session_id, user_id, messages))
            return messages[-1]["messageId"]

        with tempfile.TemporaryDirectory() as directory:
            store = module.CursorStore(Path(directory) / "cursors.json")
            count = await module.sync_session(
                "session-a",
                "919876543210",
                store=store,
                load_rows=load_rows,
                post_batch=post_batch,
            )
            self.assertEqual(count, 205)
            self.assertEqual([len(batch[2]) for batch in sent], [100, 100, 5])
            self.assertEqual(await store.get("session-a"), 205)

    async def test_failure_does_not_advance_cursor(self):
        module = load_handler()

        async def load_rows(_session_id, _after_id):
            return [{
                "id": 10,
                "role": "assistant",
                "content": "Hello",
                "timestamp": 1_722_090_600,
            }]

        async def post_batch(_session_id, _user_id, _messages):
            raise RuntimeError("endpoint unavailable")

        with tempfile.TemporaryDirectory() as directory:
            store = module.CursorStore(Path(directory) / "cursors.json")
            with self.assertRaises(RuntimeError):
                await module.sync_session(
                    "session-a",
                    "919876543210",
                    store=store,
                    load_rows=load_rows,
                    post_batch=post_batch,
                )
            self.assertEqual(await store.get("session-a"), 0)

    async def test_excluded_rows_advance_without_network_io(self):
        module = load_handler()
        calls = 0

        async def load_rows(_session_id, _after_id):
            return [
                {"id": 3, "role": "system", "content": "secret", "timestamp": 1},
                {"id": 4, "role": "assistant", "content": "NO_REPLY", "timestamp": 2},
            ]

        async def post_batch(_session_id, _user_id, _messages):
            nonlocal calls
            calls += 1
            return 0

        with tempfile.TemporaryDirectory() as directory:
            store = module.CursorStore(Path(directory) / "cursors.json")
            count = await module.sync_session(
                "session-a",
                "919876543210",
                store=store,
                load_rows=load_rows,
                post_batch=post_batch,
            )
            self.assertEqual(count, 0)
            self.assertEqual(calls, 0)
            self.assertEqual(await store.get("session-a"), 4)


class SyncDeliveriesTests(unittest.IsolatedAsyncioTestCase):
    async def test_projects_batches_and_advances_only_acknowledged_deliveries(self):
        module = load_handler()
        entries = {
            "919876543210:wamid.message_one": {
                "t": " First exact message ",
                "ts": 1_722_090_600,
            },
            "919876543210:wamid.message_two": {
                "t": "Second exact message",
                "ts": 1_722_090_601,
            },
            "malformed": {"t": "ignored", "ts": 1_722_090_602},
        }
        posted = []

        async def load_index():
            return entries

        async def post_batch(user_id, messages):
            posted.append((user_id, messages))
            return [message["messageId"] for message in messages]

        with tempfile.TemporaryDirectory() as directory:
            store = module.SeenDeliveryStore(Path(directory) / "seen.json")
            count = await module.sync_sent_deliveries(
                store=store,
                load_index=load_index,
                post_batch=post_batch,
            )
            self.assertEqual(count, 2)
            self.assertEqual([item[0] for item in posted], ["919876543210"])
            self.assertEqual(
                [message["messageId"] for message in posted[0][1]],
                ["wamid.message_one", "wamid.message_two"],
            )
            self.assertEqual(
                await store.unseen(["wamid.message_one", "wamid.message_two"]),
                [],
            )

    async def test_delivery_failure_does_not_mark_messages_seen(self):
        module = load_handler()

        async def load_index():
            return {
                "919876543210:wamid.message_one": {
                    "t": "Exact message",
                    "ts": 1_722_090_600,
                },
            }

        async def post_batch(_user_id, _messages):
            raise RuntimeError("endpoint unavailable")

        with tempfile.TemporaryDirectory() as directory:
            store = module.SeenDeliveryStore(Path(directory) / "seen.json")
            with self.assertRaises(RuntimeError):
                await module.sync_sent_deliveries(
                    store=store,
                    load_index=load_index,
                    post_batch=post_batch,
                )
            self.assertEqual(
                await store.unseen(["wamid.message_one"]),
                ["wamid.message_one"],
            )


class HandlerSchedulingTests(unittest.IsolatedAsyncioTestCase):
    async def test_agent_end_schedules_work_without_waiting_for_it(self):
        module = load_handler()
        started = asyncio.Event()
        release = asyncio.Event()

        async def delayed_sync(session_id, user_id):
            self.assertEqual((session_id, user_id), ("session-a", "919876543210"))
            started.set()
            await release.wait()

        module._delayed_sync = delayed_sync
        with mock.patch.dict(os.environ, {
            "INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED": "true",
            "INSIGHT_HERMES_TRANSCRIPT_URL": "https://example.test/api/hermes/transcripts",
            "HERMES_TOOL_SHARED_SECRET": "secret",
        }):
            module.handle("agent:end", {
                "platform": "whatsapp_cloud",
                "session_id": "session-a",
                "user_id": "919876543210",
            })
        await asyncio.wait_for(started.wait(), timeout=0.2)
        self.assertTrue(module._BACKGROUND_TASKS)
        release.set()
        await asyncio.sleep(0)

    async def test_startup_schedules_whatsapp_catch_up(self):
        module = load_handler()
        called = asyncio.Event()

        async def sync_all():
            called.set()

        module._sync_all_sessions = sync_all
        with mock.patch.dict(os.environ, {
            "INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED": "true",
            "INSIGHT_HERMES_TRANSCRIPT_URL": "https://example.test/api/hermes/transcripts",
            "HERMES_TOOL_SHARED_SECRET": "secret",
        }):
            module.handle("gateway:startup", {})
        await asyncio.wait_for(called.wait(), timeout=0.2)

    async def test_agent_end_also_schedules_exact_delivery_sync(self):
        module = load_handler()
        called = asyncio.Event()

        async def delayed_sync(_session_id, _user_id):
            called.set()

        module._delayed_sync = delayed_sync
        with mock.patch.dict(os.environ, {
            "INSIGHT_HERMES_TRANSCRIPT_SYNC_ENABLED": "true",
            "INSIGHT_HERMES_TRANSCRIPT_URL": "https://example.test/api/hermes/transcripts",
            "HERMES_TOOL_SHARED_SECRET": "secret",
        }):
            module.handle("agent:end", {
                "platform": "whatsapp_cloud",
                "session_id": "session-a",
                "user_id": "919876543210",
            })
        await asyncio.wait_for(called.wait(), timeout=0.2)


if __name__ == "__main__":
    unittest.main()
