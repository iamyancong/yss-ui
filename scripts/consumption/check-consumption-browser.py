import json
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(
    description="验证官方插件消费项目，调用方分别启动 dev 与 preview。"
)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--dev-port", type=int, default=4193)
parser.add_argument("--preview-port", type=int, default=4192)
parser.add_argument(
    "--consumer", type=Path, help="开发用例目录；提供时验证 App.vue 模板 HMR 并恢复文件"
)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    for mode, port in [
        ("production", args.preview_port),
        ("development", args.dev_port),
    ]:
        page = browser.new_page()
        errors = []
        requests = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("request", lambda r: requests.append(r.url))
        try:
            page.goto(f"http://127.0.0.1:{port}", wait_until="networkidle")
            page.locator("#ready").wait_for(timeout=20000)
            initial = list(requests)
            initial_resources = page.evaluate(
                "performance.getEntriesByType('resource').map(x=>({url:x.name,raw:x.decodedBodySize,transferred:x.transferSize}))"
            )
            page.get_by_role("button", name="Table", exact=True).click()
            page.get_by_text("Alice", exact=True).wait_for(timeout=20000)
            table = list(requests)
            page.screenshot(path=str(args.output / f"{mode}-table.png"))
            page.get_by_role("button", name="Form", exact=True).click()
            page.locator("input").first.wait_for(timeout=20000)
            page.get_by_role("button", name="Chart", exact=True).click()
            page.locator("canvas").first.wait_for(timeout=20000)
            size = page.locator("canvas").first.bounding_box()
            assert size and size["height"] > 0
            hmr = None
            if mode == "development" and args.consumer:
                source = args.consumer / "src/App.vue"
                original = source.read_text()
                try:
                    page.evaluate("window.__hmrMarker=42")
                    source.write_text(
                        original.replace("Button ready", "Button HMR ready")
                    )
                    page.get_by_text("Button HMR ready", exact=True).wait_for(
                        timeout=20000
                    )
                    assert page.evaluate("window.__hmrMarker") == 42
                    hmr = True
                finally:
                    source.write_text(original)
            resources = page.evaluate(
                "performance.getEntriesByType('resource').map(x=>({url:x.name,raw:x.decodedBodySize,transferred:x.transferSize}))"
            )
            modal = None
            if mode == "development":
                page.goto(
                    f"http://127.0.0.1:{port}/modal.html", wait_until="networkidle"
                )
                assert page.locator("input").count() == 0
                page.get_by_role("button", name="Open form").click()
                page.locator(".ant-modal input").wait_for(timeout=60000)
                page.locator(".ant-modal input").fill("First open")
                page.locator(".ant-modal-close").click()
                page.get_by_role("button", name="Open form").click()
                page.locator(".ant-modal input").wait_for(timeout=30000)
                modal = {"firstOpen": True, "reopen": True}
            results.append(
                {
                    "mode": mode,
                    "hmr": hmr,
                    "modal": modal,
                    "initialResources": initial_resources,
                    "allResources": resources,
                    "initialRequests": initial,
                    "tableRequests": table,
                    "errors": errors,
                    "chartSize": size,
                }
            )
        except Exception as e:
            results.append(
                {
                    "mode": mode,
                    "errors": errors,
                    "failure": str(e),
                    "requests": requests,
                }
            )
        page.close()
    browser.close()
(args.output / "browser-results.json").write_text(json.dumps(results, indent=2))
for r in results:
    print(r["mode"], r.get("failure", "ok"), r["errors"])

assert all(not r.get("failure") and not r["errors"] for r in results), results
