"""Key the black background out of the generated building art, crop, and measure the base diamond.
Writes sprites/b-<id>.png (RGBA) + manifest entries. Base diamond: bottom-most opaque pixel is the front
corner; left/right extremes of the bottom 45% of the sprite are the side corners."""
import json, sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
def key(path):
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(int)
    lum = a.max(axis=2)
    bg = lum <= 22                                   # near-black
    lab, n = ndimage.label(bg)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    mask = ~np.isin(lab, list(border))               # everything not connected to the border
    mask = ndimage.binary_closing(mask, iterations=2)
    mask = ndimage.binary_fill_holes(mask)
    alpha = (mask * 255).astype(np.uint8)
    # soften edge where the source is dark (anti-aliased into black): alpha follows brightness there
    edge = mask & ~ndimage.binary_erosion(mask, iterations=2)
    soft = np.clip(lum / 60.0, 0, 1)
    alpha = np.where(edge, (alpha * np.maximum(soft, 0.35)).astype(np.uint8), alpha)
    rgba = np.dstack([a.astype(np.uint8), alpha])
    ys, xs = np.where(alpha > 40)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    out = Image.fromarray(rgba[y0:y1 + 1, x0:x1 + 1])
    m = alpha[y0:y1 + 1, x0:x1 + 1] > 40
    H, W = m.shape
    bottom = np.where(m.any(axis=1))[0].max()
    front_x = int(np.mean(np.where(m[bottom])[0]))
    lower = m[int(H * 0.55):]
    cols = np.where(lower.any(axis=0))[0]
    left, right = int(cols.min()), int(cols.max())
    width = right - left
    return out, {'w': W, 'h': H, 'left': left, 'right': right, 'bottom': int(bottom), 'front_x': front_x, 'diamond_w': width}
if __name__ == '__main__':
    import os
    os.makedirs('out', exist_ok=True)
    for f in sorted(x for x in os.listdir('.') if x.endswith('.png') and x[0].isdigit()):
        im, meta = key(f)
        im.save('out/' + f)
        print(f, meta)
