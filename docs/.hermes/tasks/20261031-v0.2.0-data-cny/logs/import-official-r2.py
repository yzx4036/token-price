#!/usr/bin/env python3
"""R2 返工：把可官方核验的厂商条目从 aggregate 升为 official。

输入：.cache/truth2/ 下编排层亲抓的官方页原文（zhipu.md / mistral.html / openai.md / xai_pricing.md）
输出：追加/覆盖 src/data/entries/api.json 中的 official 条目（原子写入）

原则：
- 只取官方页明确列出的数字，不做汇率推算；
- 免费模型记 0 并在 notes 注明官方原文「免费」；
- 同一模型多档位时，档位写进 model 名（括号内），同主体名的多档都保留；
- 分档模型（如「输入长度 [0,32K)」）默认只收录最短档一次，notes 写明其余档位见官方页。
"""
import json, re, pathlib, html as H

ROOT = pathlib.Path(__file__).resolve().parents[5]
CACHE = ROOT / ".cache" / "truth2"
DATA = ROOT / "src" / "data"
TODAY = "2026-10-31"


def txt_lines(p):
    t = pathlib.Path(p).read_text(encoding="utf-8", errors="replace")
    t = re.sub(r"<script.*?</script>", " ", t, flags=re.S)
    t = re.sub(r"<style.*?</style>", " ", t, flags=re.S)
    t = re.sub(r"<[^>]+>", "\n", t)
    return [l.strip() for l in H.unescape(t).split("\n") if l.strip()]


def md_tables(text, include_quoted=True):
    """解析 markdown 表格；include_quoted 时把 '> | ...' 引用块表格也算进来"""
    tables, cur = [], []
    for raw in text.split("\n"):
        s = raw.strip()
        if s.startswith("> "):
            s = s[2:].strip()
        if s.startswith("|") and s.endswith("|"):
            cells = [c.strip().replace("\\", "") for c in s.strip("|").split("|")]
            if all(re.fullmatch(r":?-{1,}:?", c) for c in cells if c):
                continue
            cur.append(cells)
        else:
            if cur:
                tables.append(cur); cur = []
    if cur:
        tables.append(cur)
    return tables


def num(s):
    s = s.strip().replace(",", "")
    if s in ("免费", "-", "", "不支持"):
        return 0.0 if s == "免费" else None
    m = re.fullmatch(r"\$?(\d+(?:\.\d+)?)", s)
    return float(m.group(1)) if m else None


def ctx(s):
    s = s.strip()
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*([KkMm])", s)
    if not m:
        return None
    v = float(m.group(1))
    return int(v * (1024 if m.group(2).lower() == "k" else 1048576))


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def pretty(raw: str) -> str:
    """'gpt-6.1-sol' -> 'GPT-6.1 Sol'；'gpt-5.5 (<272k context length)' -> 'GPT-5.5 (<272K Context Length)'"""
    parts = [x for x in re.split(r"[\s\-]+", raw) if x]
    words = []
    for part in parts:
        if part.lower() == "gpt":
            words.append("GPT")
        elif re.fullmatch(r"[0-9.]+", part):
            words.append(part)
        else:
            words.append(part[0].upper() + part[1:] if part else part)
    text = " ".join(words).replace("GPT ", "GPT-")
    text = re.sub(r"\b(\d+)([km])\b", lambda m: m.group(1) + m.group(2).upper(), text)
    return text


def mk(pid, pname, model, cur_, inp, out, cache_read, cache_write, ctxt, src, cond, notes, extra_id="", id_base=None):
    base = id_base if id_base is not None else model
    return {
        "id": f"{pid}-{slug(base)}{extra_id}",
        "providerId": pid,
        "provider": pname,
        "model": model,
        "billingCurrency": cur_,
        "unit": "per_1m_tokens",
        "inputPrice": inp,
        "outputPrice": out,
        "cacheReadPrice": cache_read,
        "cacheWritePrice": cache_write,
        "contextTokens": ctxt,
        "sourceUrl": src,
        "provenance": "official",
        "aggregateSource": None,
        "aggregateFetchedAt": None,
        "verifiedAt": TODAY,
        "status": "verified",
        "pricingCondition": cond,
        "notes": notes,
    }


def zhipu():
    page = (CACHE / "zhipu.md").read_text(encoding="utf-8", errors="replace")
    SRC = "https://docs.bigmodel.cn/cn/guide/start/pricing"
    out, seen = [], set()
    for t in md_tables(page):
        hdr = t[0]
        if len(hdr) < 6 or "输入单价" not in hdr[2]:
            continue
        for r in t[1:]:
            if len(r) < 6:
                continue
            name, context, inp, outp, _store, hit = r[0], r[1], r[2], r[3], r[4], r[5]
            i, o, c = num(inp), num(outp), num(hit)
            if i is None or o is None:
                continue
            tier = ""
            if context.startswith("输入长度") or context.startswith("输入 "):
                norm = context.replace(" ", "")
                if "≥32K" in norm:
                    tier = "≥32K"
                elif re.search(r"\[0,32K\)|≤32K", norm):
                    tier = "≤32K"
                else:
                    # 剩下的都是长输入档（如「输入 [32K, 200K)」），不能与短档同名
                    tier = "≥32K"
            key = (name, tier)
            if tier and key in seen:
                continue
            seen.add(key)
            model = f"{name}（{tier}）" if tier else name
            cond = "人民币原价，元/百万 Tokens"
            if tier:
                cond += f"；输入长度档位 {tier}"
            notes = f"官方页表头「输入单价（元/百万 Tokens）／输出单价／缓存命中（元/百万 Tokens）」；原文：{name} | {context} | {inp} | {outp} | 缓存命中 {hit}"
            if tier:
                notes += "。官方页按输入长度分档，同模型其他档位见官方页"
            if hit == "免费":
                notes += "。缓存命中官方标注「免费」，按 0 计"
            out.append(mk("zhipu", "智谱 GLM", model, "CNY", i, o, c, None,
                          ctx(context), SRC, cond, notes,
                          extra_id=("-le32k" if tier == "≤32K" else "-gt32k") if tier else "",
                          id_base=name))
    return out


def mistral():
    SRC = "https://docs.mistral.ai/inference/pricing/"
    L = txt_lines(CACHE / "mistral.html")
    s = next(i for i in range(len(L) - 5) if L[i] == "Model" and L[i + 1] == "Input" and L[i + 2] == "Cached input")
    rows, i = [], s + 4
    while i < len(L) - 3 and L[i + 1] == "↗":
        vals = L[i + 2:i + 5]
        if not all(re.fullmatch(r"\$\d+(?:\.\d+)?", v) for v in vals):
            break
        rows.append((L[i], float(vals[0][1:]), float(vals[2][1:]), float(vals[1][1:])))
        i += 5
    # 只收 Mistral 自有模型；官方页同时列有转售的 Z.ai / DeepSeek，不是 Mistral 模型
    resold = ("Z.ai", "DeepSeek", "GLM")
    out = []
    for name, inp, outp, cached in rows:
        if any(name.startswith(x) for x in resold):
            continue
        out.append(mk("mistral", "Mistral AI", name, "USD", inp, outp, cached, None, None, SRC,
                      "美元原价，Standard 档，/M Tokens",
                      f"官方页 Standard 档表格原文：{name} | Input ${inp} | Cached input ${cached} | Output ${outp}。"
                      "该页同时列出由 Mistral 平台转售的第三方模型（Z.ai / DeepSeek），不属于 Mistral 自有模型，未收录。"
                      "上下文长度官方页未列出，故置空。"))
    return out


def openai():
    SRC = "https://platform.openai.com/docs/pricing"
    page = (CACHE / "openai.md").read_text(encoding="utf-8", errors="replace")
    t = md_tables(page)[0]
    assert t[0][0] == "Model" and "Short context input" in t[0][1], t[0]
    out = []
    for r in t[1:]:
        if len(r) < 5:
            continue
        name, inp, outp, cached, write30 = r[0], r[1], r[2], r[3], r[4]
        i, o, c, w = num(inp), num(outp), num(cached), num(write30)
        if i is None or o is None:
            continue
        model = pretty(name)
        out.append(mk("openai", "OpenAI", model, "USD", i, o, c, w, None, SRC,
                      "美元原价，Standard 档；只取 Short context 档，长上下文档单价更高",
                      f"官方页「Standard pricing data」表原文：{name} | short input ${i} | short output ${o} | "
                      f"short cached input ${c} | short 30m write ${w}。长上下文档位另计，本站未收录。"))
    return out


def xai():
    SRC = "https://docs.x.ai/docs/pricing"
    page = (CACHE / "xai_pricing.md").read_text(encoding="utf-8", errors="replace")
    out = []
    for t in md_tables(page):
        if t[0][:2] != ["Model", "Context"]:
            continue
        for r in t[1:]:
            if len(r) < 5:
                continue
            name, context, inp, cached, outp = r[0], r[1], r[2], r[3], r[4]
            i, o, c = num(inp), num(outp), num(cached)
            if i is None or o is None:
                continue
            m = re.match(r"(.*?)\s*\(([^)]*)\)\s*$", name)
            base, tier = (m.group(1), m.group(2)) if m else (name, "")
            tier_zh = "prompt<200K" if "<" in tier else ("prompt≥200K" if "≥" in tier else tier)
            model = f"{base}（{tier_zh}）" if tier_zh else base
            out.append(mk("xai", "xAI Grok", model, "USD", i, o, c, None, ctx(context), SRC,
                          "美元原价，文本 API；按 prompt token 数分档",
                          f"官方页 Text API Pricing 表原文：{name} | {context} | {inp} | {cached} | {outp}",
                          extra_id=("-lt200k" if "<" in tier else "-ge200k") if tier else ""))
    return out


def main():
    providers = {p["id"]: p for p in json.loads((DATA / "providers.json").read_text(encoding="utf-8"))}
    new = zhipu() + mistral() + openai() + xai()
    ids = [e["id"] for e in new]
    assert len(ids) == len(set(ids)), [x for x in ids if ids.count(x) > 1][:5]
    for e in new:
        assert e["providerId"] in providers, e["providerId"]
        assert e["sourceUrl"].startswith("https://")

    path = DATA / "entries" / "api.json"
    old = json.loads(path.read_text(encoding="utf-8"))
    keep = [e for e in old if e["providerId"] not in ("zhipu", "mistral", "openai", "xai")]
    merged = keep + new
    ids = [e["id"] for e in merged]
    assert len(ids) == len(set(ids)), [x for x in ids if ids.count(x) > 1][:5]

    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)

    from collections import Counter
    print("新增 official 条目:", len(new))
    print("替换掉的旧条目:", len(old) - len(keep))
    print("api.json 总条目:", len(merged))
    print("按厂商:", dict(Counter(e["providerId"] for e in new)))
    print("按币种:", dict(Counter(e["billingCurrency"] for e in new)))


if __name__ == "__main__":
    main()
