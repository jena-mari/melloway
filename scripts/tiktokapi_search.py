"""One local TikTokApi keyword search. No downloads, pagination or paid providers."""
import asyncio
import contextlib
import json
import logging
import os
import re
import sys


class CollectorError(Exception):
    pass


def video_sources(response):
    if not isinstance(response, dict) or response.get("status_code") != 0:
        raise CollectorError("SEARCH_FAILED")
    items = response.get("item_list")
    if not isinstance(items, list):
        # Missing search data must not be reported as a successful empty search.
        raise CollectorError("SEARCH_FAILED")
    videos = []
    for item in items[:10]:
        if not isinstance(item, dict):
            continue
        post_id = item.get("id")
        author = item.get("author")
        username = author.get("uniqueId") if isinstance(author, dict) else None
        if not isinstance(post_id, str) or not re.fullmatch(r"[0-9]{1,30}", post_id):
            continue
        if not isinstance(username, str) or not re.fullmatch(r"[A-Za-z0-9_.]{1,100}", username):
            continue
        description = item.get("desc")
        # Canonical URL comes from IDs/usernames actually returned by TikTok,
        # rather than a model generating a plausible video identifier.
        videos.append({"url": f"https://www.tiktok.com/@{username}/video/{post_id}",
                       "postId": post_id,
                       "description": description[:8192] if isinstance(description, str) else ""})
    return videos


async def search_once(query, api_factory=None, token=None):
    if api_factory is None:
        try:
            from TikTokApi import TikTokApi
        except ImportError:
            raise CollectorError("SETUP_REQUIRED") from None
        api_factory = TikTokApi
    async with api_factory(logging_level=logging.CRITICAL) as api:
        try:
            await api.create_sessions(num_sessions=1, browser="chromium", headless=True,
                                      ms_tokens=[token] if token else None, sleep_after=3,
                                      timeout=15000, enable_session_recovery=False,
                                      suppress_resource_load_types=["image", "media", "font"])
        except Exception:
            raise CollectorError("SESSION_FAILED") from None
        try:
            response = await api.make_request(
                url="https://www.tiktok.com/api/search/item/full/",
                params={"keyword": query, "count": 10, "cursor": 0, "source": "search_video"},
                # In TikTokApi 7.3.3 this is total attempts, despite the name.
                retries=1, exponential_backoff=False, session_index=0)
        except Exception:
            raise CollectorError("SEARCH_FAILED") from None
        return {"version": 1, "status": "ok", "query": query, "videos": video_sources(response)}


def main():
    result = {"version": 1, "status": "error", "code": "INVALID_INPUT"}
    exit_code = 1
    try:
        data = json.loads(sys.stdin.read(2048))
        query = data.get("query") if isinstance(data, dict) else None
        if not isinstance(query, str) or not query.strip() or len(query) > 300:
            raise CollectorError("INVALID_INPUT")
        # Discard library logs/errors: request URLs and cookies may be sensitive.
        logging.disable(logging.CRITICAL)
        with open(os.devnull, "w") as sink, contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
            result = asyncio.run(asyncio.wait_for(
                search_once(query, token=os.environ.get("TIKTOK_MS_TOKEN") or None), timeout=40))
        exit_code = 0
    except CollectorError as error:
        result = {"version": 1, "status": "error", "code": str(error)}
    except asyncio.TimeoutError:
        result = {"version": 1, "status": "error", "code": "TIMEOUT"}
    except Exception:
        result = {"version": 1, "status": "error", "code": "SEARCH_FAILED"}
    print(json.dumps(result))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
