"""
test_typography_layout.py
=========================
typography_layout 모듈의 기본 동작을 검증하는 테스트 스크립트.

테스트 제목: "전지적독자시점"

실행 방법:
    python test_typography_layout.py

출력:
    test_output/전지적독자시점.svg  — 생성된 SVG 파일
    test_output/전지적독자시점.png  — 렌더링된 PNG (Pillow 설치 시)

테스트 항목:
    1. generate_svg() 호출 성공 여부
    2. 반환값이 유효한 SVG 문자열인지 확인
    3. 모든 글자가 SVG에 존재하는지 확인
    4. SVG 파일 저장 성공 여부
    5. (선택) Pillow PNG 렌더링 성공 여부
"""

import os
import re
import sys
import xml.etree.ElementTree as ET

# ── 모듈 임포트 ───────────────────────────────────────────────────────────────
try:
    from typography_layout import (
        generate_svg,
        generate_items,
        items_to_svg,
        LayoutError,
    )
except ImportError as exc:
    sys.exit(f"[FAIL] typography_layout 모듈을 가져올 수 없습니다: {exc}")

# ── 설정 ──────────────────────────────────────────────────────────────────────
TEST_TITLE  = "외신에게 집착받는 천재 마법사가 되었다"
OUTPUT_DIR  = "test_output"
os.makedirs(OUTPUT_DIR, exist_ok=True)

SVG_PATH    = os.path.join(OUTPUT_DIR, f"{TEST_TITLE}.svg")
PNG_PATH    = os.path.join(OUTPUT_DIR, f"{TEST_TITLE}.png")

PASS  = "[PASS]"
FAIL  = "[FAIL]"
SKIP  = "[SKIP]"

results = []


def check(name: str, condition: bool, detail: str = ""):
    tag = PASS if condition else FAIL
    msg = f"{tag} {name}"
    if detail:
        msg += f" — {detail}"
    print(msg)
    results.append(condition)
    return condition


# ── 테스트 1: generate_svg() 호출 ────────────────────────────────────────────
print(f"\n테스트 제목: \"{TEST_TITLE}\"\n")

svg_str = None
try:
    svg_str = generate_svg(TEST_TITLE)
    check("generate_svg() 호출 성공", True,
          f"{len(svg_str)} 글자 SVG 반환")
except LayoutError as exc:
    check("generate_svg() 호출 성공", False, str(exc))
    sys.exit("API 오류로 테스트를 중단합니다.")
except Exception as exc:
    check("generate_svg() 호출 성공", False, f"예외: {exc}")
    sys.exit("예기치 않은 오류로 테스트를 중단합니다.")


# ── 테스트 2: 반환값이 유효한 SVG인지 ────────────────────────────────────────
is_svg = bool(re.search(r'<svg[\s\S]*?</svg>', svg_str, re.IGNORECASE))
check("반환값에 <svg> 블록 포함", is_svg)

try:
    # ElementTree는 xmlns가 있으면 태그를 {ns}text 형태로 처리하므로 제거 후 파싱
    svg_no_ns = re.sub(r'\s+xmlns(?::\w+)?="[^"]*"', '', svg_str)
    root = ET.fromstring(svg_no_ns)
    check("SVG XML 파싱 성공", True)
except ET.ParseError as exc:
    check("SVG XML 파싱 성공", False, str(exc))
    root = None


# ── 테스트 3: 모든 글자가 SVG에 존재하는지 ───────────────────────────────────
if root is not None:
    expected_chars = [c for c in TEST_TITLE if c != ' ']
    svg_chars = [
        (t.text or '').strip()
        for t in root.iter('text')
        if (t.text or '').strip()
    ]
    missing = [c for c in expected_chars if c not in svg_chars]
    check(
        f"모든 글자({len(expected_chars)}자) SVG에 포함",
        len(missing) == 0,
        f"누락: {missing}" if missing else f"SVG <text> 요소 수: {len(svg_chars)}"
    )

    # font-size 최솟값 확인
    font_sizes = []
    for t in root.iter('text'):
        try:
            font_sizes.append(float(t.get('font-size', 0)))
        except ValueError:
            pass
    if font_sizes:
        min_fs = min(font_sizes)
        check("최소 font-size ≥ 8px", min_fs >= 8,
              f"최소={min_fs:.0f}px  최대={max(font_sizes):.0f}px")


# ── 테스트 4: SVG 파일 저장 ───────────────────────────────────────────────────
try:
    with open(SVG_PATH, 'w', encoding='utf-8') as f:
        f.write(svg_str)
    check("SVG 파일 저장 성공", True, SVG_PATH)
except OSError as exc:
    check("SVG 파일 저장 성공", False, str(exc))


# ── 테스트 5: (선택) Pillow PNG 렌더링 ───────────────────────────────────────
try:
    from PIL import Image, ImageDraw, ImageFont

    _BASE = os.path.dirname(os.path.abspath(__file__))
    FONT_PATH = os.path.join(_BASE, "BookkMyungjo_Bold.ttf")

    from typography_layout import parse_svg_to_items

    items = parse_svg_to_items(svg_str)

    W, H = 2000, 1000
    canvas = Image.new('RGB', (W, H), (255, 255, 255))
    draw   = ImageDraw.Draw(canvas)

    for it in items:
        try:
            font = ImageFont.truetype(FONT_PATH, it['fs'])
        except Exception:
            font = ImageFont.load_default()
        cx = it['x'] + it['fs'] / 2
        cy = it['y'] - it['fs'] / 2
        bbox = draw.textbbox((0, 0), it['char'], font=font)
        cw   = bbox[2] - bbox[0]
        ch   = bbox[3] - bbox[1]
        tx   = cx - cw / 2 - bbox[0]
        ty   = cy - ch / 2 - bbox[1]
        draw.text((tx, ty), it['char'], fill=(0, 0, 0), font=font)

    canvas.save(PNG_PATH)
    check("Pillow PNG 렌더링 성공", True, PNG_PATH)

except ImportError:
    print(f"{SKIP} Pillow PNG 렌더링 — Pillow가 설치되지 않아 건너뜁니다.")
except Exception as exc:
    check("Pillow PNG 렌더링 성공", False, str(exc))


# ── 결과 요약 ─────────────────────────────────────────────────────────────────
passed = sum(results)
total  = len(results)
print(f"\n{'='*50}")
print(f"결과: {passed}/{total} 통과")
if passed == total:
    print("모든 테스트를 통과했습니다.")
else:
    print("일부 테스트가 실패했습니다. 위 출력을 확인하세요.")
