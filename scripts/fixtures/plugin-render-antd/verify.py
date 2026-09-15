from playwright.sync_api import sync_playwright
from pathlib import Path
import json
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:4194")
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
result = {}
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    page = b.new_page()
    page.on("console", lambda m: logs.append({"type": m.type, "text": m.text[:700]}))
    page.on("pageerror", lambda m: logs.append({"type": "pageerror", "text": str(m)}))
    try:
        page.goto(args.url, wait_until="networkidle")
        page.get_by_text("Native", exact=True).last.click()
        page.locator("input").first.fill("Native changed")
        page.get_by_role("heading", name="Native").click()
        result["native"] = page.evaluate("JSON.parse(JSON.stringify(window.spike))")
        page.get_by_text("YSS", exact=True).last.click()
        page.locator("input").first.fill("YSS changed")
        page.get_by_role("heading", name="Native").click()
        result["yss"] = page.evaluate("JSON.parse(JSON.stringify(window.spike))")
        page.screenshot(path=str(args.output / "spike.png"))
    except Exception as e:
        result["failure"] = str(e)
    result["logs"] = logs
    b.close()
(args.output / "spike-results.json").write_text(
    json.dumps(result, ensure_ascii=False, indent=2)
)
print(json.dumps(result, ensure_ascii=False)[:2000])

assert not result.get("failure"), result
assert result["native"]["stats"]["pluginCalls"] > 0
assert result["native"]["stats"]["pluginCalls"] == result["yss"]["stats"]["pluginCalls"]
assert result["yss"]["stats"]["yssUpdates"] > 0
assert not any(item["type"] == "pageerror" for item in logs)
