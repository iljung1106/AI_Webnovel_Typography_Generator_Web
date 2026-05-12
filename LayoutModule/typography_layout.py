"""
typography_layout.py
====================
웹소설 타이틀 타이포그래피 레이아웃 생성 모듈.

Gemini를 두 번 호출해 한국어 제목을 SVG 레이아웃으로 변환합니다.

    1차 호출 — 분석 (build_analysis_prompt):
        단어 그룹, 품사, 핵심 키워드, 강조 글자, 단어별 크기 등급 결정.

    2차 호출 — 레이아웃 (build_layout_prompt):
        분석 결과를 컨텍스트로 받아 SVG <text> 배치 생성.

후처리 파이프라인 (좌표 공간 내 순수 수학 처리, Pillow 불필요):
    attract_words    → 같은 단어 글자끼리 끌어당김
    push_apart       → 겹치는 글자 밀어냄 (읽기 순서 bias)
    normalize_spacing→ 행 내/행 간 간격 균등화
    center_last_row  → 마지막 짧은 행 중앙 정렬
    center_items     → 전체 레이아웃을 캔버스 중앙으로 이동

────────────────────────────────────────────────────────────────────────────
공개 API
────────────────────────────────────────────────────────────────────────────

generate_svg(title, *, api_key=None, canvas_w=2000, canvas_h=1000,
             font_class="명조", attract=True, push=True, order_bias=True,
             equalize=True, center_last=True) -> str
    제목 문자열을 받아 완성된 SVG 문서 문자열을 반환합니다.
    실패 시 LayoutError 예외를 발생시킵니다.

generate_items(title, *, api_key=None, canvas_w=2000, canvas_h=1000,
               attract=True, push=True, order_bias=True,
               equalize=True, center_last=True) -> list[dict]
    후처리까지 완료된 글리프 아이템 리스트를 반환합니다.
    커스텀 렌더러를 연결할 때 사용하세요.

items_to_svg(items, width, height) -> str
    글리프 아이템 리스트를 SVG 문자열로 직렬화합니다.

────────────────────────────────────────────────────────────────────────────
글리프 아이템 형식
────────────────────────────────────────────────────────────────────────────
각 아이템은 dict:
    {
        'char'    : str    # 글자 한 자
        'x'       : float  # 글자 박스 왼쪽 가장자리 (SVG x)
        'y'       : float  # 글자 박스 아래쪽 가장자리 (SVG y)
        'fs'      : int    # font-size (px) — 글자 박스는 fs × fs 정사각형
        'rotation': float  # 회전 각도 (도, 기본 0)
    }

────────────────────────────────────────────────────────────────────────────
의존성
────────────────────────────────────────────────────────────────────────────
    requests, python-dotenv
    OPENROUTER_API_KEY 환경변수 (또는 api_key 파라미터로 직접 전달)
"""

import os
import re
import xml.etree.ElementTree as ET
from typing import List, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

# ── 상수 ──────────────────────────────────────────────────────────────────────

_API_MODEL   = "google/gemini-3-flash-preview"
_API_URL     = "https://openrouter.ai/api/v1/chat/completions"
_CANVAS_W    = 2000
_CANVAS_H    = 1000


# ── 예외 ──────────────────────────────────────────────────────────────────────

class LayoutError(RuntimeError):
    """레이아웃 생성 중 복구 불가능한 오류."""


# ── 프롬프트 빌더 ─────────────────────────────────────────────────────────────

def build_analysis_prompt(title: str) -> str:
    """1차 호출용 프롬프트: 제목에서 품사·키워드·크기 등급을 분석."""
    words     = [w for w in title.split(' ') if w]
    word_info = ' / '.join(f'"{w}"' for w in words)
    lines = [
        "You are a Korean webnovel typography expert.",
        "",
        f'Analyze the title: "{title}"',
        f"Words (space-separated): [{word_info}]",
        "",
        "Tasks:",
        "a) List each word and its characters grouped. Example: 전생했더니 → [전,생,했,더,니]",
        "b) Classify each word's part of speech: noun / verb / adjective / particle / verbal-ending / other.",
        "c) From a webnovel reader's perspective, choose 1–3 words that carry the most narrative impact",
        "   (typically nouns representing the protagonist's identity, world, or core concept).",
        "d) From those chosen words, pick 1–5 individual characters to emphasize most strongly.",
        "e) Assign a relative size tier to each word: LARGE / MEDIUM / SMALL.",
        "   Nouns/verbs with narrative weight → LARGE. Minor nouns/verbs → MEDIUM.",
        "   Particles, verbal endings → SMALL.",
        "",
        "Output strictly in this format (no extra text):",
        "groups: [word→chars], [word→chars], ...",
        "pos: word=POS, word=POS, ...",
        "keywords: word, word, ...",
        "emphasize: char, char, ...",
        "sizes: word=LARGE|MEDIUM|SMALL, word=LARGE|MEDIUM|SMALL, ...",
    ]
    return '\n'.join(lines)


def build_layout_prompt(title: str, analysis: str) -> str:
    """2차 호출용 프롬프트: 분석 결과를 받아 SVG 레이아웃 생성."""
    chars     = [c for c in title if c != ' ']
    char_list = ', '.join(f'"{c}"' for c in chars)
    words     = [w for w in title.split(' ') if w]
    word_info = ' / '.join(f'"{w}"' for w in words)

    three_rows = (
        "MUST use exactly 3 rows. Distribute characters as evenly as possible across 3 rows."
        if len(chars) >= 12
        else "Break into multiple rows if the title is long."
    )
    lines = [
        "Create a Korean webnovel title typography SVG. Black text on white background, placement only — no colors, no effects.",
        "",
        f'Title: "{title}"',
        f"Words: [{word_info}]",
        f"Characters to place (no spaces): [{char_list}]",
        "",
        "── Typography analysis (use this to guide sizing) ──",
        analysis.strip(),
        "────────────────────────────────────────────────────",
        "",
        "Design the SVG layout using the analysis above:",
        "Canvas: viewBox=\"0 0 2000 1000\". Origin top-left, x→right, y↓down.",
        "Each Korean glyph is a SQUARE of size font-size × font-size.",
        "<text x y font-size>: x=LEFT edge, y=BOTTOM edge of glyph box.",
        "",
        "Rules:",
        "- Use every character exactly once, in reading order (left-to-right, top-to-bottom).",
        "- The <text> elements must appear in reading order; first character closest to top-left, last closest to bottom-right.",
        "- Characters within the same word must be close (gap 5–30px). Gap between words: 80–160px.",
        "- NEVER split a word across rows. All characters of the same word must be on the same row.",
        f"- {three_rows} Row gap: 30–80px.",
        "- Apply the size tiers from the analysis: LARGE words get the biggest font-size, SMALL words the smallest.",
        "- All characters within the same word share the same font-size.",
        "- Nouns and verbs: larger font-size. Particles (은/는/이/가/을/를/의/에/로/와/과/도/만 etc.) and verbal endings: smaller font-size.",
        "- Max size ratio between any two characters: 2×. Minimum font-size: 150.",
        "- No random scattering, no diagonal placement, no rotation.",
        "- Center the title block on the canvas.",
        "- All glyphs must stay within canvas bounds.",
        "- Punctuation/symbols (!, ?, :, S, etc.): narrower than Korean glyphs; use font-size 80–150.",
        "",
        "Output ONLY the SVG. No explanation, no markdown.",
        "Each character = one <text> element with only x, y, font-size attributes.",
    ]
    return '\n'.join(lines)


# ── API 호출 ──────────────────────────────────────────────────────────────────

def _call_api(prompt: str, api_key: str) -> str:
    """OpenRouter API를 통해 Gemini를 호출하고 응답 텍스트를 반환합니다.

    실패 시 LayoutError를 발생시킵니다.
    """
    payload = {
        "model": _API_MODEL,
        "messages": [{"role": "user", "content": prompt}],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
    }
    resp = requests.post(_API_URL, headers=headers, json=payload, timeout=60)
    if resp.status_code != 200:
        raise LayoutError(f"API error {resp.status_code}: {resp.text[:200]}")
    choices = resp.json().get("choices")
    if not choices:
        raise LayoutError("API returned no choices.")
    return choices[0].get("message", {}).get("content", "").strip()


# ── SVG 파싱 ──────────────────────────────────────────────────────────────────

def parse_svg_to_items(raw: str) -> List[dict]:
    """SVG 문자열에서 <text> 요소를 파싱해 글리프 아이템 리스트를 반환합니다.

    파싱 실패 시 LayoutError를 발생시킵니다.
    """
    raw = re.sub(r'^```[^\n]*\n?', '', raw)
    raw = re.sub(r'\n?```$',       '', raw).strip()
    m   = re.search(r'<svg[\s\S]*?</svg>', raw, re.IGNORECASE)
    if not m:
        raise LayoutError(f"No <svg> block found in response. Preview: {raw[:300]}")

    svg = m.group()
    svg = re.sub(r'\s+xmlns(?::\w+)?="[^"]*"', '', svg)
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as exc:
        raise LayoutError(f"SVG XML parse error: {exc}") from exc

    items = []
    for t in root.iter('text'):
        char = (t.text or '').strip()
        if not char:
            continue
        try:
            x  = float(t.get('x', 0))
            y  = float(t.get('y', 0))
            fs = float(t.get('font-size', 100))
        except ValueError:
            continue
        rotation = 0.0
        transform = t.get('transform', '')
        rm = re.search(r'rotate\(\s*([-\d.]+)', transform)
        if rm:
            rotation = float(rm.group(1))
        items.append({
            'char':     char,
            'x':        x,
            'y':        y,
            'fs':       max(8, int(fs)),
            'rotation': rotation,
        })

    if not items:
        raise LayoutError("Parsed SVG contained no <text> elements.")
    return items


# ── 후처리 알고리즘 ───────────────────────────────────────────────────────────

def attract_words(items: List[dict], title: str,
                  strength: float = 0.4, max_iters: int = 60) -> List[dict]:
    """같은 단어(띄어쓰기 없는 연속 글자) 내 글자 쌍을 서로 끌어당깁니다.

    words가 1개 이하(띄어쓰기 없음)이면 아무것도 하지 않습니다.
    같은 행(|dy_center| < fs)에 있는 쌍에만 적용합니다.
    """
    words = [w for w in title.split(' ') if w]
    if len(words) <= 1:
        return items

    word_idx: List[int] = []
    for wi, w in enumerate(words):
        for _ in w:
            word_idx.append(wi)

    items      = [dict(it) for it in items]
    n          = min(len(items), len(word_idx))
    TARGET_GAP = 8  # px — 같은 단어 글자 사이 최대 목표 간격

    for _ in range(max_iters):
        moved = False
        for i in range(n - 1):
            j = i + 1
            if word_idx[i] != word_idx[j]:
                continue
            a, b = items[i], items[j]
            if abs((a['y'] - a['fs'] / 2) - (b['y'] - b['fs'] / 2)) > max(a['fs'], b['fs']):
                continue  # 다른 행으로 판단 — 건드리지 않음
            gap = b['x'] - (a['x'] + a['fs'])
            if gap <= TARGET_GAP:
                continue
            pull       = (gap - TARGET_GAP) * strength / 2
            a['x']    += pull
            b['x']    -= pull
            moved      = True
        if not moved:
            break
    return items


def push_apart(items: List[dict], max_iters: int = 80,
               order_bias: bool = True) -> List[dict]:
    """겹치는 글리프 bbox를 반복적으로 밀어냅니다.

    order_bias=True:  리스트 앞 글자(읽기 순서 앞) → 위/왼쪽,
                      뒷 글자 → 아래/오른쪽으로 밀어 읽기 방향을 강화.
    order_bias=False: 현재 좌표 기준으로 이미 더 왼쪽/위에 있는 쪽이 계속 밀림.
    """
    items = [dict(it) for it in items]
    for _ in range(max_iters):
        moved = False
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                a, b   = items[i], items[j]
                al, at = a['x'],          a['y'] - a['fs']
                ar, ab = a['x'] + a['fs'], a['y']
                bl, bt = b['x'],          b['y'] - b['fs']
                br, bb = b['x'] + b['fs'], b['y']

                over_x = min(ar, br) - max(al, bl)
                over_y = min(ab, bb) - max(at, bt)
                if over_x <= 0 or over_y <= 0:
                    continue

                if over_x <= over_y:
                    push = over_x / 2 + 1
                    if order_bias:
                        a['x'] -= push
                        b['x'] += push
                    elif (a['x'] + a['fs'] / 2) <= (b['x'] + b['fs'] / 2):
                        a['x'] -= push
                        b['x'] += push
                    else:
                        a['x'] += push
                        b['x'] -= push
                else:
                    push = over_y / 2 + 1
                    if order_bias:
                        a['y'] -= push
                        b['y'] += push
                    elif (a['y'] - a['fs'] / 2) <= (b['y'] - b['fs'] / 2):
                        a['y'] -= push
                        b['y'] += push
                    else:
                        a['y'] += push
                        b['y'] -= push
                moved = True
        if not moved:
            break
    return items


def _group_rows(items: List[dict]) -> List[List[dict]]:
    """y_center 근접도 기준으로 글리프를 행(row) 단위로 클러스터링합니다."""
    def yc(it: dict) -> float:
        return it['y'] - it['fs'] / 2

    rows: List[List[dict]] = []
    for it in sorted(items, key=lambda it: (yc(it), it['x'])):
        placed = False
        for row in rows:
            row_yc = sum(yc(r) for r in row) / len(row)
            thresh = max(it['fs'], max(r['fs'] for r in row)) * 0.6
            if abs(yc(it) - row_yc) < thresh:
                row.append(it)
                placed = True
                break
        if not placed:
            rows.append([it])

    for row in rows:
        row.sort(key=lambda it: it['x'])
    rows.sort(key=lambda row: sum(yc(r) for r in row) / len(row))
    return rows


def normalize_spacing(items: List[dict], strength: float = 0.5) -> List[dict]:
    """행 내 가로 간격, 행 간 세로 간격을 각각 평균값으로 균등화합니다.

    strength(0~1): 현재 위치와 이상적 위치 사이의 보간 비율.
    """
    items = [dict(it) for it in items]
    rows  = _group_rows(items)

    # 행 내 수평 균등화
    for row in rows:
        if len(row) < 2:
            continue
        gaps       = [row[k + 1]['x'] - (row[k]['x'] + row[k]['fs'])
                      for k in range(len(row) - 1)]
        target_gap = sum(gaps) / len(gaps)
        for k in range(1, len(row)):
            ideal_x     = row[k - 1]['x'] + row[k - 1]['fs'] + target_gap
            row[k]['x'] += (ideal_x - row[k]['x']) * strength

    # 행 간 수직 균등화
    if len(rows) >= 2:
        bottoms      = [max(r['y']           for r in row) for row in rows]
        tops         = [min(r['y'] - r['fs'] for r in row) for row in rows]
        v_gaps       = [tops[k + 1] - bottoms[k] for k in range(len(rows) - 1)]
        target_vgap  = sum(v_gaps) / len(v_gaps)
        for k in range(1, len(rows)):
            current_top = min(r['y'] - r['fs'] for r in rows[k])
            ideal_top   = max(r['y'] for r in rows[k - 1]) + target_vgap
            dy          = (ideal_top - current_top) * strength
            for it in rows[k]:
                it['y'] += dy

    return items


def center_last_row(items: List[dict]) -> List[dict]:
    """2줄 이상일 때 마지막 행을 전체 콘텐츠의 수평 중심에 맞게 이동합니다.

    짧은 마지막 줄이 왼쪽에 쏠리는 현상을 방지합니다.
    """
    if not items:
        return items
    items = [dict(it) for it in items]
    rows  = _group_rows(items)
    if len(rows) < 2:
        return items

    all_cx  = (min(it['x'] for it in items) +
               max(it['x'] + it['fs'] for it in items)) / 2
    last    = rows[-1]
    last_cx = (min(it['x'] for it in last) +
               max(it['x'] + it['fs'] for it in last)) / 2
    dx      = all_cx - last_cx
    if abs(dx) < 1:
        return items
    for it in last:
        it['x'] += dx
    return items


def center_items(items: List[dict], width: int, height: int) -> List[dict]:
    """전체 레이아웃의 bbox 중심을 캔버스 중앙으로 이동합니다."""
    if not items:
        return items
    min_x     = min(it['x']            for it in items)
    max_x     = max(it['x'] + it['fs'] for it in items)
    min_y     = min(it['y'] - it['fs'] for it in items)
    max_y     = max(it['y']            for it in items)
    dx        = (width  - (max_x - min_x)) / 2 - min_x
    dy        = (height - (max_y - min_y)) / 2 - min_y
    return [{**it, 'x': it['x'] + dx, 'y': it['y'] + dy} for it in items]


def _postprocess(items: List[dict], title: str, canvas_w: int, canvas_h: int,
                 attract: bool, push: bool, order_bias: bool,
                 equalize: bool, center_last: bool) -> List[dict]:
    """후처리 파이프라인 전체를 순서대로 실행합니다."""
    if attract:
        items = attract_words(items, title)
    if push:
        items = push_apart(items, order_bias=order_bias)
    if equalize:
        items = normalize_spacing(items)
    if center_last:
        items = center_last_row(items)
    items = center_items(items, canvas_w, canvas_h)
    return items


# ── SVG 직렬화 ────────────────────────────────────────────────────────────────

def items_to_svg(items: List[dict], width: int = _CANVAS_W,
                 height: int = _CANVAS_H) -> str:
    """글리프 아이템 리스트를 완성된 SVG 문서 문자열로 직렬화합니다.

    생성되는 SVG의 좌표 규칙:
        x = 글자 박스 왼쪽 가장자리
        y = 글자 박스 아래쪽 가장자리
        font-size = 글자 박스 한 변의 길이 (정사각형)
    """
    _esc = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}

    def esc(s: str) -> str:
        for k, v in _esc.items():
            s = s.replace(k, v)
        return s

    lines = [
        f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">',
        f'  <rect width="{width}" height="{height}" fill="white"/>',
    ]
    for it in items:
        x   = round(it['x'], 2)
        y   = round(it['y'], 2)
        fs  = it['fs']
        rot = it.get('rotation', 0.0)
        cx  = round(x + fs / 2, 2)
        cy  = round(y - fs / 2, 2)
        transform = (f' transform="rotate({rot:.1f} {cx} {cy})"'
                     if abs(rot) > 0.5 else '')
        lines.append(
            f'  <text x="{x}" y="{y}" font-size="{fs}"{transform}>'
            f'{esc(it["char"])}</text>'
        )
    lines.append('</svg>')
    return '\n'.join(lines)


# ── 공개 API ──────────────────────────────────────────────────────────────────

def generate_items(
    title: str,
    *,
    api_key: Optional[str] = None,
    canvas_w: int   = _CANVAS_W,
    canvas_h: int   = _CANVAS_H,
    attract:      bool = True,
    push:         bool = True,
    order_bias:   bool = True,
    equalize:     bool = True,
    center_last:  bool = True,
) -> List[dict]:
    """제목을 받아 후처리 완료된 글리프 아이템 리스트를 반환합니다.

    Parameters
    ----------
    title       : 한국어 제목 문자열 (띄어쓰기 포함 가능)
    api_key     : OpenRouter API 키. None이면 환경변수 OPENROUTER_API_KEY 사용.
    canvas_w/h  : 캔버스 크기 (픽셀). SVG viewBox와 후처리에 모두 반영됩니다.
    attract     : 같은 단어 글자 끌어당기기
    push        : 겹침 밀어내기
    order_bias  : 밀어낼 때 읽기 순서 방향 우선
    equalize    : 간격 균등화
    center_last : 마지막 행 중앙 정렬

    Returns
    -------
    list of dict  — 각 dict는 {'char', 'x', 'y', 'fs', 'rotation'}

    Raises
    ------
    LayoutError : API 오류, SVG 파싱 실패 등
    """
    key = api_key or os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise LayoutError("OPENROUTER_API_KEY is not set.")

    # 1차 호출: 분석
    analysis = _call_api(build_analysis_prompt(title), key)

    # 2차 호출: SVG 레이아웃
    raw   = _call_api(build_layout_prompt(title, analysis), key)
    items = parse_svg_to_items(raw)

    # 후처리
    items = _postprocess(items, title,
                         canvas_w, canvas_h,
                         attract, push, order_bias,
                         equalize, center_last)
    return items


def generate_svg(
    title: str,
    *,
    api_key: Optional[str]  = None,
    canvas_w: int            = _CANVAS_W,
    canvas_h: int            = _CANVAS_H,
    attract:      bool       = True,
    push:         bool       = True,
    order_bias:   bool       = True,
    equalize:     bool       = True,
    center_last:  bool       = True,
) -> str:
    """제목을 받아 완성된 SVG 문서 문자열을 반환합니다.

    Parameters
    ----------
    title       : 한국어 제목 문자열 (띄어쓰기 포함 가능)
    api_key     : OpenRouter API 키. None이면 환경변수 OPENROUTER_API_KEY 사용.
    canvas_w/h  : SVG viewBox 및 후처리 기준 캔버스 크기.
    attract     : 같은 단어 글자 끌어당기기
    push        : 겹침 밀어내기
    order_bias  : 밀어낼 때 읽기 순서 방향 우선
    equalize    : 간격 균등화
    center_last : 마지막 행 중앙 정렬

    Returns
    -------
    str — 완성된 SVG 문서 (viewBox 0 0 canvas_w canvas_h)

    Raises
    ------
    LayoutError : API 오류, SVG 파싱 실패 등
    """
    items = generate_items(
        title,
        api_key=api_key,
        canvas_w=canvas_w,
        canvas_h=canvas_h,
        attract=attract,
        push=push,
        order_bias=order_bias,
        equalize=equalize,
        center_last=center_last,
    )
    return items_to_svg(items, canvas_w, canvas_h)
