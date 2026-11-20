"""验证保留的 tarball 消费产物：生产根入口渲染与历史全量安装。"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('artifacts', type=Path, help='YSS_KEEP_CONSUMER=true 保留的 package-consumer-* 目录')
args = parser.parse_args()
results = []
servers = []


class QuietHandler(SimpleHTTPRequestHandler):
    """仅为本机测试提供静态产物，不输出请求日志。"""
    def log_message(self, *_args):
        pass


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        try:
            for name, filename in [('root', 'root.html'), ('install', 'install.html')]:
                directory = args.artifacts / f'{name}-dist'
                assert (directory / filename).is_file(), f'缺少产物: {directory / filename}'
                server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(directory)))
                servers.append(server)
                Thread(target=server.serve_forever, daemon=True).start()
                context = browser.new_context(locale='zh-CN', viewport={'width': 1280, 'height': 900})
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{server.server_port}/{filename}', wait_until='domcontentloaded')
                if name == 'root':
                    page.get_by_text('张三', exact=True).first.wait_for(state='visible', timeout=180000)
                    assert page.locator('input').count() > 0, '表单未渲染'
                    assert page.evaluate('!!window.yssRootConsumer'), '根入口及语言/别名断言未完成'
                    page.screenshot(path=str(args.artifacts / 'root.png'))
                else:
                    page.wait_for_function('window.yssInstallVerified === true', timeout=180000)
                assert not errors, errors
                results.append({'case': name, 'errors': errors, 'passed': True})
                context.close()
        finally:
            browser.close()
finally:
    for server in servers:
        server.shutdown()
    (args.artifacts / 'browser-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False))
