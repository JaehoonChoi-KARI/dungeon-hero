// Emoji rendered once into offscreen canvases, plus a white silhouette for hit flashes.

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const RES = 2.5; // oversampling so sprites stay crisp on retina screens
const cache = new Map();

function makeCanvas(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return c;
}

export function emojiSprite(emoji, size) {
  const key = emoji + '|' + size;
  let s = cache.get(key);
  if (s) return s;
  const px = Math.ceil(size * RES);
  const dim = Math.ceil(px * 1.3);
  const img = makeCanvas(dim);
  const c = img.getContext('2d');
  c.font = `${px}px ${EMOJI_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(emoji, dim / 2, dim / 2 + px * 0.06);
  const flash = makeCanvas(dim);
  const f = flash.getContext('2d');
  f.drawImage(img, 0, 0);
  f.globalCompositeOperation = 'source-in';
  f.fillStyle = '#ffffff';
  f.fillRect(0, 0, dim, dim);
  s = { img, flash, size: dim / RES };
  cache.set(key, s);
  return s;
}

export function drawSprite(ctx, spr, x, y, { flip = false, alpha = 1, flash = 0, scale = 1 } = {}) {
  const d = spr.size * scale;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.globalAlpha = alpha;
  ctx.drawImage(spr.img, -d / 2, -d / 2, d, d);
  if (flash > 0) {
    ctx.globalAlpha = alpha * Math.min(1, flash);
    ctx.drawImage(spr.flash, -d / 2, -d / 2, d, d);
  }
  ctx.restore();
}
