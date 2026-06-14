#!/usr/bin/env python3
"""
Analyze rendered preset frames to validate taxonomy predictions.

Dependencies:
  pip install colorthief opencv-python-headless numpy pillow

Usage:
  python analyze_frames.py --frames-dir ./frames/50798552 --static-taxonomy ./static.json
"""

from pathlib import Path
import json
import argparse
import sys

try:
    from colorthief import ColorThief
    import cv2
    import numpy as np
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    print("Install with: pip install colorthief opencv-python-headless numpy pillow", file=sys.stderr)
    sys.exit(1)


def analyze_preset_frames(frames_dir: Path) -> dict:
    """Analyze frames from a rendered preset."""
    frames = sorted(frames_dir.glob("*.png"))
    if len(frames) < 3:
        return {"error": "Insufficient frames", "frame_count": len(frames)}

    return {
        "frame_count": len(frames),
        "colors": analyze_colors(frames),
        "brightness": analyze_brightness(frames),
        "motion": analyze_motion(frames),
        "edges": analyze_edges(frames),
        "particles": detect_particles(frames[-1])
    }


def analyze_colors(frames: list) -> dict:
    """Extract dominant colors using ColorThief."""
    mid_frame = frames[len(frames) // 2]

    ct = ColorThief(str(mid_frame))
    palette = ct.get_palette(color_count=5, quality=1)
    dominant = ct.get_color(quality=1)

    def rgb_to_hue_family(r, g, b):
        r, g, b = r/255, g/255, b/255
        max_c, min_c = max(r, g, b), min(r, g, b)
        l = (max_c + min_c) / 2

        if max_c == min_c:
            return "neutral"

        s = (max_c - min_c) / (2 - max_c - min_c) if l > 0.5 else (max_c - min_c) / (max_c + min_c)
        if s < 0.1:
            return "neutral"

        if max_c == r:
            h = (g - b) / (max_c - min_c) + (6 if g < b else 0)
        elif max_c == g:
            h = (b - r) / (max_c - min_c) + 2
        else:
            h = (r - g) / (max_c - min_c) + 4
        h *= 60

        if h < 60 or h >= 300:
            return "warm"
        elif h < 180:
            return "natural"
        else:
            return "cool"

    families = [rgb_to_hue_family(*c) for c in palette]
    unique_families = len(set(families))

    return {
        "dominant_rgb": list(dominant),
        "dominant_hex": "#{:02x}{:02x}{:02x}".format(*dominant),
        "dominant_family": rgb_to_hue_family(*dominant),
        "palette": [list(c) for c in palette],
        "unique_families": unique_families,
        "is_rainbow": unique_families >= 3
    }


def analyze_brightness(frames: list) -> dict:
    """Analyze brightness distribution across frames."""
    values = []
    for frame_path in frames:
        img = cv2.imread(str(frame_path), cv2.IMREAD_GRAYSCALE)
        values.append(np.mean(img) / 255)

    mean_brightness = float(np.mean(values))

    if mean_brightness < 0.25:
        classification = "dark"
    elif mean_brightness > 0.65:
        classification = "bright"
    else:
        classification = "balanced"

    return {
        "mean": mean_brightness,
        "std": float(np.std(values)),
        "min": float(min(values)),
        "max": float(max(values)),
        "classification": classification
    }


def analyze_motion(frames: list) -> dict:
    """Measure motion between frames as proxy for energy level."""
    if len(frames) < 2:
        return {"error": "Need at least 2 frames"}

    motion_scores = []
    for i in range(1, len(frames)):
        prev = cv2.imread(str(frames[i-1]), cv2.IMREAD_GRAYSCALE)
        curr = cv2.imread(str(frames[i]), cv2.IMREAD_GRAYSCALE)
        diff = cv2.absdiff(prev, curr)
        motion_scores.append(float(np.mean(diff) / 255))

    mean_motion = float(np.mean(motion_scores))

    if mean_motion < 0.02:
        classification = "calm"
    elif mean_motion < 0.05:
        classification = "flowing"
    elif mean_motion < 0.10:
        classification = "dynamic"
    elif mean_motion < 0.18:
        classification = "energetic"
    elif mean_motion < 0.28:
        classification = "intense"
    else:
        classification = "explosive"

    return {
        "mean_motion": mean_motion,
        "max_motion": float(max(motion_scores)),
        "std_motion": float(np.std(motion_scores)),
        "classification": classification
    }


def analyze_edges(frames: list) -> dict:
    """Analyze edge characteristics for archetype hints."""
    mid_frame = frames[len(frames) // 2]
    img = cv2.imread(str(mid_frame), cv2.IMREAD_GRAYSCALE)

    edges = cv2.Canny(img, 50, 150)
    edge_density = float(np.sum(edges > 0) / edges.size)

    lines = cv2.HoughLinesP(edges, 1, np.pi/180, 50, minLineLength=30, maxLineGap=10)
    line_count = len(lines) if lines is not None else 0

    if line_count > 50 and edge_density > 0.08:
        hint = "geometric"
    elif edge_density < 0.03:
        hint = "fluid_organic"
    elif edge_density > 0.15:
        hint = "waveform"
    else:
        hint = "unknown"

    return {
        "edge_density": edge_density,
        "line_count": line_count,
        "archetype_hint": hint
    }


def detect_particles(frame_path: Path) -> dict:
    """Detect small bright particles for particle/cosmic classification."""
    img = cv2.imread(str(frame_path), cv2.IMREAD_GRAYSCALE)

    _, bright = cv2.threshold(img, 200, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    small_particles = sum(1 for c in contours if cv2.contourArea(c) < 50)

    return {
        "total_bright_regions": len(contours),
        "small_particle_count": small_particles,
        "is_particle_hint": small_particles > 20
    }


def compare_to_static(render: dict, static: dict) -> dict:
    """Compare rendered analysis to static taxonomy predictions."""
    comparisons = {}

    # Energy level comparison
    if "motion" in render and "energyLabel" in static:
        render_energy = render["motion"]["classification"]
        static_energy = static.get("energyLabel", "dynamic")

        levels = ["calm", "flowing", "dynamic", "energetic", "intense", "explosive"]
        render_idx = levels.index(render_energy) if render_energy in levels else 2
        static_idx = levels.index(static_energy) if static_energy in levels else 2

        comparisons["energy"] = {
            "static": static_energy,
            "rendered": render_energy,
            "match": abs(render_idx - static_idx) <= 1,
            "off_by": abs(render_idx - static_idx)
        }

    # Color comparison
    if "colors" in render:
        render_hue = render["colors"]["dominant_family"]
        static_hue = static.get("dominantHue", static.get("colorProfile", "unknown"))

        comparisons["color"] = {
            "static": static_hue,
            "rendered": render_hue,
            "match": render_hue == static_hue or static_hue == "rainbow" or render["colors"]["is_rainbow"]
        }

    # Brightness comparison
    if "brightness" in render:
        render_bright = render["brightness"]["classification"]
        static_bright = static.get("brightness", "balanced")

        comparisons["brightness"] = {
            "static": static_bright,
            "rendered": render_bright,
            "match": render_bright == static_bright
        }

    # Visual style hint comparison
    if "edges" in render and "visualStyle" in static:
        render_hint = render["edges"]["archetype_hint"]
        static_style = static.get("visualStyle", "abstract")

        hint_matches = {
            "geometric": ["geometric", "kaleidoscope"],
            "fluid_organic": ["fluid_organic", "fractal", "abstract"],
            "waveform": ["waveform", "particle"],
            "unknown": []
        }
        compatible = static_style in hint_matches.get(render_hint, [])

        comparisons["visual_style"] = {
            "static": static_style,
            "rendered_hint": render_hint,
            "match": compatible or render_hint == "unknown"
        }

    matches = sum(1 for c in comparisons.values() if c.get("match", False))
    total = len(comparisons)
    match_rate = matches / total if total > 0 else 0

    return {
        "comparisons": comparisons,
        "matches": matches,
        "total": total,
        "match_rate": match_rate,
        "confidence": "HIGH" if match_rate >= 0.75 else "MEDIUM" if match_rate >= 0.5 else "LOW"
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Analyze preset frames for taxonomy validation")
    parser.add_argument("--frames-dir", required=True, help="Directory containing frame PNGs")
    parser.add_argument("--static-taxonomy", help="JSON file with static analysis predictions")
    parser.add_argument("--output", default="analysis.json", help="Output file path")
    args = parser.parse_args()

    frames_dir = Path(args.frames_dir)
    result = analyze_preset_frames(frames_dir)

    if args.static_taxonomy:
        with open(args.static_taxonomy) as f:
            static = json.load(f)
        result["comparison"] = compare_to_static(result, static)

    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)

    print(json.dumps(result, indent=2))
