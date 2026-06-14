#!/usr/bin/env python3
"""
Use Claude Vision API to validate taxonomy classifications.
Only run for mismatches or random samples (expensive).

Dependencies:
  pip install anthropic

Usage:
  python llm_validate.py --frames-dir ./frames/50798552 --preset-hash 50798552

Environment:
  ANTHROPIC_API_KEY must be set
"""

import base64
from pathlib import Path
import json
import argparse
import sys
import os

try:
    import anthropic
except ImportError:
    print("Missing dependency: anthropic", file=sys.stderr)
    print("Install with: pip install anthropic", file=sys.stderr)
    sys.exit(1)


CLASSIFICATION_PROMPT = """Analyze these frames from a music visualizer preset.

For each dimension, provide your classification and brief reasoning:

1. ENERGY LEVEL (choose one):
   - calm: Nearly static, ambient, meditative
   - flowing: Gentle movement, relaxed pace
   - dynamic: Active motion, engaging
   - energetic: High motion, exciting
   - intense: Very active, powerful movement
   - explosive: Maximum energy, chaotic motion

2. VISUAL STYLE (choose one):
   - geometric: Polygons, grids, structured shapes, angular
   - fractal: Self-similar patterns, recursive, infinite zoom feel
   - particle: Space themes, stars, particles, nebulae
   - kaleidoscope: Heavy color manipulation, warping, trippy
   - fluid_organic: Fluid, flowing, natural motion, soft edges
   - waveform: Data visualization, spectrum, HUD-like, analytical
   - tunnel: Tunnel/vortex effects
   - abstract: Non-specific patterns, doesn't fit other categories

3. DOMINANT COLORS: List 2-3 primary colors visible

4. COLOR FAMILY (choose one):
   - warm: Predominantly reds, oranges, yellows
   - cool: Predominantly blues, purples, cyans
   - natural: Predominantly greens
   - neutral: Predominantly whites, grays, blacks
   - rainbow: Multiple distinct color families present

5. BRIGHTNESS (choose one):
   - dark: Predominantly dark, low brightness
   - bright: Predominantly bright, high brightness
   - balanced: Mix of dark and bright areas

6. MOOD: Describe in exactly 3 words

Respond ONLY with valid JSON in this exact format:
{
  "energy_level": "level",
  "energy_reasoning": "One sentence explanation",
  "visual_style": "style",
  "style_reasoning": "One sentence explanation",
  "dominant_colors": ["color1", "color2"],
  "color_family": "family",
  "brightness": "brightness",
  "mood": ["word1", "word2", "word3"],
  "confidence": "HIGH or MEDIUM or LOW"
}"""


def validate_with_llm(frames_dir: Path, preset_hash: str) -> dict:
    """Send frames to Claude Vision for subjective classification."""

    if not os.environ.get("ANTHROPIC_API_KEY"):
        return {"error": "ANTHROPIC_API_KEY not set", "preset_hash": preset_hash}

    client = anthropic.Anthropic()

    frames = sorted(frames_dir.glob("*.png"))
    if len(frames) == 0:
        return {"error": "No frames found", "preset_hash": preset_hash}

    if len(frames) > 5:
        indices = [0, len(frames)//4, len(frames)//2, 3*len(frames)//4, -1]
        frames = [frames[i] for i in indices]

    image_content = []
    for frame in frames:
        with open(frame, "rb") as f:
            data = base64.standard_b64encode(f.read()).decode("utf-8")
        image_content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": data
            }
        })

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                *image_content,
                {"type": "text", "text": CLASSIFICATION_PROMPT}
            ]
        }]
    )

    response_text = message.content[0].text

    try:
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        result = json.loads(response_text[start:end])
        result["parse_success"] = True
    except (json.JSONDecodeError, ValueError) as e:
        result = {
            "parse_success": False,
            "parse_error": str(e),
            "raw_response": response_text
        }

    result["preset_hash"] = preset_hash
    result["model"] = "claude-sonnet-4-6"
    result["frames_analyzed"] = len(frames)

    return result


def compare_llm_to_static(llm: dict, static: dict) -> dict:
    """Compare LLM classification to static analysis."""
    if not llm.get("parse_success", False):
        return {"error": "LLM parse failed"}

    comparisons = {}

    # Energy
    if "energy_level" in llm:
        llm_energy = llm["energy_level"]
        static_energy = static.get("energyLabel", "dynamic")

        levels = ["calm", "flowing", "dynamic", "energetic", "intense", "explosive"]
        llm_idx = levels.index(llm_energy) if llm_energy in levels else 2
        static_idx = levels.index(static_energy) if static_energy in levels else 2

        comparisons["energy"] = {
            "llm": llm_energy,
            "static": static_energy,
            "match": abs(llm_idx - static_idx) <= 1,
            "llm_reasoning": llm.get("energy_reasoning", "")
        }

    # Visual style
    if "visual_style" in llm:
        llm_style = llm["visual_style"]
        static_style = static.get("visualStyle", "abstract")

        comparisons["visual_style"] = {
            "llm": llm_style,
            "static": static_style,
            "match": llm_style == static_style,
            "llm_reasoning": llm.get("style_reasoning", "")
        }

    # Color family
    if "color_family" in llm:
        llm_color = llm["color_family"]
        static_color = static.get("dominantHue", static.get("colorProfile", "neutral"))

        comparisons["color"] = {
            "llm": llm_color,
            "static": static_color,
            "match": llm_color == static_color
        }

    # Brightness
    if "brightness" in llm:
        llm_bright = llm["brightness"]
        static_bright = static.get("brightness", "balanced")

        comparisons["brightness"] = {
            "llm": llm_bright,
            "static": static_bright,
            "match": llm_bright == static_bright
        }

    matches = sum(1 for c in comparisons.values() if c.get("match", False))
    total = len(comparisons)

    return {
        "comparisons": comparisons,
        "match_rate": matches / total if total > 0 else 0,
        "llm_confidence": llm.get("confidence", "UNKNOWN"),
        "llm_mood": llm.get("mood", [])
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LLM-based taxonomy validation")
    parser.add_argument("--frames-dir", required=True)
    parser.add_argument("--preset-hash", required=True)
    parser.add_argument("--static-taxonomy", help="JSON file with static predictions")
    parser.add_argument("--output", default="llm-validation.json")
    args = parser.parse_args()

    result = validate_with_llm(Path(args.frames_dir), args.preset_hash)

    if args.static_taxonomy:
        with open(args.static_taxonomy) as f:
            static = json.load(f)
        result["comparison_to_static"] = compare_llm_to_static(result, static)

    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)

    print(json.dumps(result, indent=2))
