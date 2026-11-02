"""NotePick read-only stdio bridge. Reuses pinned JD-Taobao-MCP modules, not model tools."""
import asyncio
import json
import os
import sys
import ipaddress
from urllib.parse import urlparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "JD-Taobao-MCP"))
os.environ["PLAYWRIGHT_HEADLESS"] = "false"
os.environ["ALLOW_STATE_CHANGING_ACTIONS"] = "false"
os.environ["BROWSER_PROFILE_DIR"] = str(ROOT / ".private" / "browser-profile")
os.environ["ARTIFACTS_DIR"] = str(ROOT / ".private" / "artifacts")
os.environ["NAVIGATION_TIMEOUT_MS"] = "12000"
os.environ["ACTION_TIMEOUT_MS"] = "3000"
os.environ["ACTION_DELAY_MS"] = "300"
from jd_taobao_mcp.config import Settings
from jd_taobao_mcp.service import ShoppingBrowserService
from jd_taobao_mcp.extractors import extract_product_detail
from jd_taobao_mcp.safety import page_requires_user_verification

async def main():
    service = ShoppingBrowserService(Settings.from_env())
    # User may close the visible window. Recover the upstream controller on the next click.
    async def controller(platform):
        browser = service._browser_for_platform(platform)
        if browser._context is not None:
            try:
                if not browser._context.pages:
                    await browser.close()
                    browser._notepick_routes = False
            except Exception:
                await browser.close()
                browser._notepick_routes = False
        await browser.start()
        if not getattr(browser, "_notepick_routes", False):
            async def guard(route):
                u = urlparse(route.request.url)
                host = (u.hostname or "").lower()
                blocked = host in {"localhost", "localhost.localdomain"} or host.endswith((".local", ".internal", ".localhost"))
                try:
                    blocked = blocked or not ipaddress.ip_address(host).is_global
                except ValueError:
                    blocked = blocked or "." not in host
                allowed = any(host == x or host.endswith("." + x) for x in ["jd.com", "360buy.com", "taobao.com", "tmall.com"])
                if u.scheme not in {"https", "http"} or u.username or u.password or u.port not in {None, 80, 443} or blocked or (route.request.is_navigation_request() and route.request.frame.parent_frame is None and not allowed):
                    await route.abort()
                else:
                    await route.continue_()
            await browser._context.route("**/*", guard)
            browser._notepick_routes = True
        return browser
    async def dispatch(req):
        platform = req.get("platform")
        if platform not in {"jd", "taobao"}:
            raise ValueError("INVALID_PLATFORM")
        browser = await controller(platform)
        action = req["action"]
        if action == "login":
            await browser.open_login(platform)
            return {"requiresManual": True, "message": "请在打开的查价浏览器中自行登录或完成验证，然后搜索当前机型。"}
        if action == "search":
            result = await service.search_products(platform, req["keyword"], max_results=3, include_details=False)
            return {"requiresManual": bool(result.get("requires_user_verification") or result.get("verification_warning")), "items": [{"title": x.get("title", ""), "url": x.get("url", "")} for x in result.get("items", [])][:3], "message": None if result.get("items") else "当前页面没有提取到商品。请在查价浏览器完成登录或验证，也可手动找到商品、选择配置后点击读取当前商品。"}
        if action == "open":
            await browser.navigate(req["url"])
            return {"requiresManual": True, "message": "请在查价浏览器中核对并选择内存、硬盘等销售配置，再点击读取当前商品。"}
        if action == "read":
            async with browser.lock:
                pages = [p for p in browser._context.pages if not p.is_closed()]
                if pages:
                    browser._page = pages[-1]
                page = await browser.get_page()
                from jd_taobao_mcp.service import platform_from_url
                if platform_from_url(page.url) != platform:
                    raise ValueError("WRONG_PLATFORM")
                text = await page.locator("body").inner_text(timeout=4000)
                if page_requires_user_verification(text, page.url) or any(x in await page.title() for x in ["登录", "验证"]):
                    return {"requiresManual": True}
                detail = await extract_product_detail(page, platform)
                # Detect configurable pages and retain only explicit selected option text.
                selection = await page.evaluate("""() => {
                  const roots = [...document.querySelectorAll('#choose-attrs, #choose, [class*=skuSelector], [class*=SkuSelector], [class*=skuItem], [class*=SkuItem]')];
                  const selected = [...document.querySelectorAll('#choose .selected, #choose-attrs .selected, [aria-checked=true], [class*=sku] [class*=selected], [class*=Sku] [class*=selected]')];
                  return {configurable: roots.some(e => /内存|硬盘|容量|配置|版本/.test(e.innerText || '')), selected: selected.map(e => (e.innerText || '').trim()).filter(Boolean).join(' · ').slice(0,1500)};
                }""")
                detail["selection"] = selection
                # Never return cookies, reviews, account DOM, snapshots or full page text.
                return {"detail": {k: detail.get(k) for k in ["title", "product_url", "price_text", "product_parameters", "specifications", "selection"]}}
        raise ValueError("INVALID_ACTION")
    try:
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line:
                break
            req = {}
            try:
                req = json.loads(line)
                result = await asyncio.wait_for(dispatch(req), timeout=24)
                out = {"id": req["id"], "result": result}
            except Exception as e:
                # Exception text can contain DOM/account data; return only a stable category.
                out = {"id": req.get("id"), "error": "BROWSER_TIMEOUT" if isinstance(e, asyncio.TimeoutError) else "BROWSER_UNAVAILABLE"}
            sys.stdout.write(json.dumps(out, ensure_ascii=True) + "\n")
            sys.stdout.flush()
    finally:
        for browser in [service.jd_browser, service.taobao_browser]:
            try:
                await browser.close()
            except Exception:
                pass

if __name__ == "__main__":
    asyncio.run(main())
