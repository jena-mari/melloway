"""MOCK ONLY: no TikTokApi import, browsers, network or real videos required."""
import asyncio
import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).resolve().parents[2] / "scripts/tiktokapi_search.py"
spec = importlib.util.spec_from_file_location("tiktokapi_search", path)
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


def video(post_id="9000000000000000001", description="Mock Café Newtown. Fictional fixture only."):
    return {"id": post_id, "author": {"uniqueId": "mock_fixture"}, "desc": description}


class MockApi:
    def __init__(self, response, session_error=False, search_error=False):
        self.response, self.session_error, self.search_error = response, session_error, search_error
        self.requests = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def create_sessions(self, **options):
        self.session_options = options
        if self.session_error:
            raise RuntimeError("mock-private-session-token")

    async def make_request(self, **options):
        self.requests.append(options)
        if self.search_error:
            raise RuntimeError("mock-private-session-token")
        return self.response


class CollectorTests(unittest.IsolatedAsyncioTestCase):
    async def test_one_search_no_retries_or_recovery(self):
        api = MockApi({"status_code": 0, "item_list": [video()]})
        result = await collector.search_once("Mock Café Newtown Sydney", lambda **kw: api, "mock-token")
        self.assertEqual(len(api.requests), 1)
        self.assertEqual(api.requests[0]["retries"], 1)
        self.assertEqual(api.requests[0]["params"]["count"], 10)
        self.assertEqual(api.requests[0]["params"]["cursor"], 0)
        self.assertEqual(api.session_options["num_sessions"], 1)
        self.assertFalse(api.session_options["enable_session_recovery"])
        self.assertEqual(api.session_options["ms_tokens"], ["mock-token"])
        self.assertEqual(result["videos"][0]["postId"], "9000000000000000001")
        self.assertNotIn("mock-token", str(result))

    async def test_anonymous_session_does_not_require_credentials(self):
        api = MockApi({"status_code": 0, "item_list": []})
        self.assertEqual((await collector.search_once("Mock Sydney", lambda **kw: api))["videos"], [])
        self.assertIsNone(api.session_options["ms_tokens"])

    async def test_session_errors_do_not_leak_or_trigger_search(self):
        api = MockApi({}, session_error=True)
        with self.assertRaisesRegex(collector.CollectorError, "^SESSION_FAILED$"):
            await collector.search_once("Mock", lambda **kw: api)
        self.assertEqual(api.requests, [])

    async def test_search_errors_are_sanitized_and_not_retried(self):
        api = MockApi({}, search_error=True)
        with self.assertRaisesRegex(collector.CollectorError, "^SEARCH_FAILED$"):
            await collector.search_once("Mock", lambda **kw: api)
        self.assertEqual(len(api.requests), 1)

    def test_missing_or_malformed_data_is_not_a_successful_empty_result(self):
        for value in [None, {}, {"status_code": 1, "item_list": []},
                      {"status_code": 0}, {"status_code": 0, "item_list": None}]:
            with self.assertRaisesRegex(collector.CollectorError, "SEARCH_FAILED"):
                collector.video_sources(value)

    def test_bad_identity_is_skipped_without_inventing_posts(self):
        good = video()
        results = collector.video_sources({"status_code": 0, "item_list": [None,
            {"id": 9000000000000000001, "author": {"uniqueId": "mock"}},
            {"id": "9", "author": {"uniqueId": "bad/name"}}, good]})
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["url"], "https://www.tiktok.com/@mock_fixture/video/9000000000000000001")

    def test_output_limit_and_missing_captions(self):
        results = collector.video_sources({"status_code": 0, "item_list": [video(str(i), None) for i in range(12)]})
        self.assertEqual(len(results), 10)
        self.assertTrue(all(v["description"] == "" for v in results))
        result = collector.video_sources({"status_code": 0, "item_list": [video(description="x" * 10000)]})
        self.assertEqual(len(result[0]["description"]), 8192)


if __name__ == "__main__":
    unittest.main()
