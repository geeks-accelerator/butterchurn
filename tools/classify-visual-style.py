#!/usr/bin/env python3
"""
Butterchurn Preset Visual Style Classifier
Phase 6: ML Visual Style Tagging

Uses CLIP (Contrastive Language-Image Pre-training) to classify
rendered preset frames into visual style categories.

Usage: python classify-visual-style.py <frames_dir> <output_file>
"""

import torch
import clip
from PIL import Image
import json
import os
from pathlib import Path
from tqdm import tqdm
import sys

# Visual style categories optimized for music visualizers
CATEGORIES = [
    "fluid organic flowing water pattern",
    "particle sparkle dot effect",
    "geometric shapes lines triangles",
    "fractal recursive mathematical pattern",
    "abstract color field gradient",
    "kaleidoscope mirror symmetry",
    "tunnel depth perspective zoom",
    "waveform oscilloscope audio"
]

CATEGORY_KEYS = [
    "fluid_organic", "particle", "geometric", "fractal",
    "abstract", "kaleidoscope", "tunnel", "waveform"
]


def load_model():
    """Load CLIP model, preferring GPU if available."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[CLIP] Using device: {device}")

    model, preprocess = clip.load("ViT-B/32", device=device)
    return model, preprocess, device


def classify_preset(frame_paths, model, preprocess, device):
    """
    Classify a preset based on multiple rendered frames.
    Returns averaged scores across all frames.
    """
    all_scores = {cat: [] for cat in CATEGORY_KEYS}

    # Tokenize text descriptions once
    text = clip.tokenize(CATEGORIES).to(device)

    for frame_path in frame_paths:
        try:
            image = preprocess(Image.open(frame_path)).unsqueeze(0).to(device)

            with torch.no_grad():
                image_features = model.encode_image(image)
                text_features = model.encode_text(text)

                # Compute similarity
                similarity = (100.0 * image_features @ text_features.T).softmax(dim=-1)

            for i, cat in enumerate(CATEGORY_KEYS):
                all_scores[cat].append(similarity[0][i].item())

        except Exception as e:
            print(f"[CLIP] Warning: Could not process {frame_path}: {e}")
            continue

    if not any(all_scores.values()):
        return None

    # Average scores across frames
    avg_scores = {cat: sum(scores)/len(scores) if scores else 0.0
                  for cat, scores in all_scores.items()}
    primary = max(avg_scores, key=avg_scores.get)

    return {
        "visualStyle": primary,
        "visualStyleScores": {k: round(v, 3) for k, v in avg_scores.items()}
    }


def process_all_presets(frames_dir, output_file):
    """
    Process all preset frames and generate visual style classifications.
    """
    model, preprocess, device = load_model()

    frames_path = Path(frames_dir)
    if not frames_path.exists():
        print(f"[CLIP] Error: Frames directory not found: {frames_dir}")
        sys.exit(1)

    # Group frames by preset
    presets = {}
    for f in frames_path.glob("*.png"):
        # Filename format: preset_name_X.png where X is frame number
        parts = f.stem.rsplit("_", 1)
        if len(parts) == 2 and parts[1].isdigit():
            preset_name = parts[0]
        else:
            preset_name = f.stem

        if preset_name not in presets:
            presets[preset_name] = []
        presets[preset_name].append(str(f))

    print(f"[CLIP] Found {len(presets)} presets to classify")

    results = {}
    for preset_name, frames in tqdm(presets.items(), desc="Classifying"):
        classification = classify_preset(frames, model, preprocess, device)
        if classification:
            results[preset_name] = classification

    # Save results
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"[CLIP] Classification complete! Results saved to {output_file}")
    print(f"[CLIP] Classified {len(results)} presets")

    # Print category distribution
    distribution = {}
    for result in results.values():
        style = result.get("visualStyle", "unknown")
        distribution[style] = distribution.get(style, 0) + 1

    print("\n[CLIP] Style distribution:")
    for style, count in sorted(distribution.items(), key=lambda x: -x[1]):
        print(f"  {style}: {count}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python classify-visual-style.py <frames_dir> <output_file>")
        print("Example: python classify-visual-style.py ./frames ./visual-styles.json")
        sys.exit(1)

    frames_dir = sys.argv[1]
    output_file = sys.argv[2]

    process_all_presets(frames_dir, output_file)
