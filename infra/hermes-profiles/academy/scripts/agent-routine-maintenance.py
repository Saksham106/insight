#!/usr/bin/env python3
"""Run due Academy agent routines without an agent or model tokens."""

import os
import urllib.error
import urllib.request


def main():
    url = os.environ.get("INSIGHT_AGENT_ROUTINE_URL", "").strip()
    secret = os.environ.get("HERMES_TOOL_SHARED_SECRET", "").strip()
    if not url.startswith("https://") or not secret:
        raise SystemExit("Agent routine maintenance is not configured")
    request = urllib.request.Request(
        url, method="POST", headers={"Authorization": f"Bearer {secret}"}
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            if response.status < 200 or response.status >= 300:
                raise SystemExit(
                    f"Agent routine maintenance returned HTTP {response.status}"
                )
    except urllib.error.HTTPError as error:
        raise SystemExit(
            f"Agent routine maintenance returned HTTP {error.code}"
        ) from None
    except urllib.error.URLError:
        raise SystemExit("Agent routine maintenance endpoint is unavailable") from None


if __name__ == "__main__":
    main()
