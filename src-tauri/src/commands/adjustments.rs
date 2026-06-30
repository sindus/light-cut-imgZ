use image::{DynamicImage, Rgba};
use tauri::State;

use super::open::{build_meta, ImageMeta};
use crate::AppState;

// ── colour-space helpers ──────────────────────────────────────────────────────

fn rgb_to_hsl(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if (max - min).abs() < 1e-6 {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    let h = if (max - r).abs() < 1e-6 {
        let mut h = (g - b) / d;
        if g < b {
            h += 6.0;
        }
        h / 6.0
    } else if (max - g).abs() < 1e-6 {
        ((b - r) / d + 2.0) / 6.0
    } else {
        ((r - g) / d + 4.0) / 6.0
    };
    (h, s, l)
}

fn hue_channel(p: f32, q: f32, mut t: f32) -> f32 {
    if t < 0.0 {
        t += 1.0;
    }
    if t > 1.0 {
        t -= 1.0;
    }
    if t < 1.0 / 6.0 {
        return p + (q - p) * 6.0 * t;
    }
    if t < 0.5 {
        return q;
    }
    if t < 2.0 / 3.0 {
        return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    }
    p
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (f32, f32, f32) {
    if s < 1e-6 {
        return (l, l, l);
    }
    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;
    (
        hue_channel(p, q, h + 1.0 / 3.0),
        hue_channel(p, q, h),
        hue_channel(p, q, h - 1.0 / 3.0),
    )
}

#[inline]
fn clamp_u8(v: f32) -> u8 {
    v.clamp(0.0, 255.0).round() as u8
}

// ── tone-curve LUT (Fritsch-Carlson monotone cubic spline) ────────────────────

fn build_curve_lut(raw_points: &[[f32; 2]]) -> [u8; 256] {
    let mut pts: Vec<[f32; 2]> = raw_points.to_vec();
    pts.sort_by(|a, b| a[0].partial_cmp(&b[0]).unwrap_or(std::cmp::Ordering::Equal));
    pts.dedup_by(|a, b| (a[0] - b[0]).abs() < 1e-4);

    if pts.first().map(|p| p[0]).unwrap_or(1.0) > 0.01 {
        pts.insert(0, [0.0, 0.0]);
    }
    if pts.last().map(|p| p[0]).unwrap_or(0.0) < 0.99 {
        pts.push([1.0, 1.0]);
    }

    let n = pts.len();
    if n < 2 {
        return core::array::from_fn(|i| i as u8);
    }

    // secant slopes
    let mut delta = vec![0.0f32; n - 1];
    for k in 0..n - 1 {
        let dx = pts[k + 1][0] - pts[k][0];
        delta[k] = if dx.abs() < 1e-9 {
            0.0
        } else {
            (pts[k + 1][1] - pts[k][1]) / dx
        };
    }

    // tangents
    let mut m = vec![0.0f32; n];
    m[0] = delta[0];
    m[n - 1] = delta[n - 2];
    for k in 1..n - 1 {
        m[k] = (delta[k - 1] + delta[k]) / 2.0;
    }

    // monotonicity
    for k in 0..n - 1 {
        if delta[k].abs() < 1e-9 {
            m[k] = 0.0;
            m[k + 1] = 0.0;
        } else {
            let alpha = m[k] / delta[k];
            let beta = m[k + 1] / delta[k];
            let sq = alpha * alpha + beta * beta;
            if sq > 9.0 {
                let t = 3.0 / sq.sqrt();
                m[k] = t * alpha * delta[k];
                m[k + 1] = t * beta * delta[k];
            }
        }
    }

    let mut lut = [0u8; 256];
    #[allow(clippy::needless_range_loop)]
    for i in 0..256usize {
        let x = i as f32 / 255.0;
        let k = pts
            .windows(2)
            .position(|w| x <= w[1][0])
            .unwrap_or(n - 2)
            .min(n - 2);

        let h = pts[k + 1][0] - pts[k][0];
        let t = if h.abs() < 1e-9 {
            0.0
        } else {
            ((x - pts[k][0]) / h).clamp(0.0, 1.0)
        };
        let t2 = t * t;
        let t3 = t2 * t;

        let y = (2.0 * t3 - 3.0 * t2 + 1.0) * pts[k][1]
            + (t3 - 2.0 * t2 + t) * h * m[k]
            + (-2.0 * t3 + 3.0 * t2) * pts[k + 1][1]
            + (t3 - t2) * h * m[k + 1];

        lut[i] = (y.clamp(0.0, 1.0) * 255.0).round() as u8;
    }
    lut
}

// ── commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn adjust_brightness_contrast(
    state: State<'_, AppState>,
    tab_id: String,
    brightness: f32, // -100 … +100
    contrast: f32,   // -100 … +100
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();

    let c = contrast / 100.0 * 255.0;
    let factor = (259.0 * (c + 255.0)) / (255.0 * (259.0 - c));
    let bias = brightness / 100.0 * 255.0;

    for px in rgba.pixels_mut() {
        for ch in 0..3 {
            let v = (px[ch] as f32 - 128.0) * factor + 128.0 + bias;
            px[ch] = clamp_u8(v);
        }
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_exposure(
    state: State<'_, AppState>,
    tab_id: String,
    exposure: f32, // -3 … +3 EV
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();
    let factor = (2.0f32).powf(exposure);

    for px in rgba.pixels_mut() {
        for ch in 0..3 {
            px[ch] = clamp_u8(px[ch] as f32 * factor);
        }
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_hue_saturation(
    state: State<'_, AppState>,
    tab_id: String,
    hue: f32,        // -180 … +180 degrees
    saturation: f32, // -100 … +100
    lightness: f32,  // -100 … +100
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();

    let hue_d = hue / 360.0;
    let sat_d = saturation / 100.0;
    let lit_d = lightness / 100.0;

    for px in rgba.pixels_mut() {
        let (h, s, l) = rgb_to_hsl(
            px[0] as f32 / 255.0,
            px[1] as f32 / 255.0,
            px[2] as f32 / 255.0,
        );
        let (nr, ng, nb) = hsl_to_rgb(
            (h + hue_d).rem_euclid(1.0),
            (s + sat_d).clamp(0.0, 1.0),
            (l + lit_d).clamp(0.0, 1.0),
        );
        px[0] = clamp_u8(nr * 255.0);
        px[1] = clamp_u8(ng * 255.0);
        px[2] = clamp_u8(nb * 255.0);
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_vibrance(
    state: State<'_, AppState>,
    tab_id: String,
    vibrance: f32, // -100 … +100
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();
    let v = vibrance / 100.0;

    for px in rgba.pixels_mut() {
        let (h, s, l) = rgb_to_hsl(
            px[0] as f32 / 255.0,
            px[1] as f32 / 255.0,
            px[2] as f32 / 255.0,
        );
        // Apply more boost to less-saturated colours
        let new_s = (s + v * (1.0 - s)).clamp(0.0, 1.0);
        let (nr, ng, nb) = hsl_to_rgb(h, new_s, l);
        px[0] = clamp_u8(nr * 255.0);
        px[1] = clamp_u8(ng * 255.0);
        px[2] = clamp_u8(nb * 255.0);
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_levels(
    state: State<'_, AppState>,
    tab_id: String,
    in_black: u8,  // 0–253
    in_white: u8,  // 2–255
    gamma: f32,    // 0.1–10.0 (1.0 = linear)
    out_black: u8, // 0–253
    out_white: u8, // 2–255
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();

    let gamma_inv = 1.0 / gamma.clamp(0.01, 100.0);
    let in_range = (in_white as f32 - in_black as f32).max(1.0);
    let out_range = out_white as f32 - out_black as f32;

    let lut: [u8; 256] = core::array::from_fn(|i| {
        let normalized = ((i as f32 - in_black as f32) / in_range).clamp(0.0, 1.0);
        let gamma_out = normalized.powf(gamma_inv);
        clamp_u8(out_black as f32 + gamma_out * out_range)
    });

    for px in rgba.pixels_mut() {
        for ch in 0..3 {
            px[ch] = lut[px[ch] as usize];
        }
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_curves(
    state: State<'_, AppState>,
    tab_id: String,
    points: Vec<[f32; 2]>, // control points in 0.0–1.0
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();
    let lut = build_curve_lut(&points);

    for px in rgba.pixels_mut() {
        for ch in 0..3 {
            px[ch] = lut[px[ch] as usize];
        }
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_white_balance(
    state: State<'_, AppState>,
    tab_id: String,
    temperature: f32, // -100 (cool) … +100 (warm)
    tint: f32,        // -100 (magenta) … +100 (green)
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();

    let t = temperature / 100.0;
    let g = tint / 100.0;
    let r_mult = 1.0 + t * 0.20;
    let g_mult = 1.0 + g * 0.10;
    let b_mult = 1.0 - t * 0.20;

    for px in rgba.pixels_mut() {
        px[0] = clamp_u8(px[0] as f32 * r_mult);
        px[1] = clamp_u8(px[1] as f32 * g_mult);
        px[2] = clamp_u8(px[2] as f32 * b_mult);
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_sharpen(
    state: State<'_, AppState>,
    tab_id: String,
    amount: f32,   // 0–200 (100 = standard unsharp mask)
    radius: f32,   // 0.1–5.0
    threshold: u8, // 0–255
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;

    let rgba = img.to_rgba8();
    let blurred = image::imageops::blur(&rgba, radius.max(0.1));
    let factor = amount / 100.0;
    let w = rgba.width();
    let h_px = rgba.height();
    let mut result = rgba.clone();

    for y in 0..h_px {
        for x in 0..w {
            let orig = *rgba.get_pixel(x, y);
            let blur = *blurred.get_pixel(x, y);
            let mut out = [0u8; 4];
            for ch in 0..3 {
                let diff = orig[ch] as i32 - blur[ch] as i32;
                out[ch] = if diff.unsigned_abs() as u8 > threshold {
                    clamp_u8(orig[ch] as f32 + factor * diff as f32)
                } else {
                    orig[ch]
                };
            }
            out[3] = orig[3];
            result.put_pixel(x, y, Rgba(out));
        }
    }

    history.push(DynamicImage::ImageRgba8(result));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_denoise(
    state: State<'_, AppState>,
    tab_id: String,
    strength: f32, // 0–100
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;

    let sigma = (strength / 100.0 * 3.0).max(0.1);
    let blurred = image::imageops::blur(&img.to_rgba8(), sigma);

    history.push(DynamicImage::ImageRgba8(blurred));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

// ── unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, Rgba, RgbaImage};

    fn solid(r: u8, g: u8, b: u8) -> DynamicImage {
        let mut img = RgbaImage::new(4, 4);
        for px in img.pixels_mut() {
            *px = Rgba([r, g, b, 255]);
        }
        DynamicImage::ImageRgba8(img)
    }

    #[test]
    fn exposure_1ev_doubles_pixel() {
        let _img = solid(100, 100, 100);
        let factor = (2.0f32).powf(1.0);
        assert_eq!(clamp_u8(100.0 * factor), 200);
    }

    #[test]
    fn curve_lut_is_identity_for_two_endpoints() {
        let pts = [[0.0f32, 0.0], [1.0, 1.0]];
        let lut = build_curve_lut(&pts);
        assert_eq!(lut[0], 0);
        assert_eq!(lut[255], 255);
        assert!((lut[128] as i32 - 128).abs() <= 2);
    }

    #[test]
    fn curve_lut_brightens_midtones() {
        let pts = [[0.0f32, 0.0], [0.5, 0.75], [1.0, 1.0]];
        let lut = build_curve_lut(&pts);
        assert!(lut[128] > 150, "midtone should be brighter, got {}", lut[128]);
    }

    #[test]
    fn rgb_hsl_round_trip() {
        let (r, g, b) = (0.8f32, 0.3, 0.5);
        let (h, s, l) = rgb_to_hsl(r, g, b);
        let (r2, g2, b2) = hsl_to_rgb(h, s, l);
        assert!((r - r2).abs() < 1e-4);
        assert!((g - g2).abs() < 1e-4);
        assert!((b - b2).abs() < 1e-4);
    }

    #[test]
    fn levels_lut_clips_below_black_point() {
        let lut: [u8; 256] = core::array::from_fn(|i| {
            let normalized = ((i as f32 - 50.0) / 205.0).clamp(0.0, 1.0);
            clamp_u8(normalized * 255.0)
        });
        assert_eq!(lut[0], 0);
        assert_eq!(lut[50], 0);
        assert!(lut[51] > 0);
    }

    #[test]
    fn brightness_zero_contrast_zero_is_identity() {
        let img = solid(128, 64, 32);
        let rgba = img.to_rgba8();
        let c = 0.0f32 / 100.0 * 255.0;
        let factor = (259.0 * (c + 255.0)) / (255.0 * (259.0 - c));
        let bias = 0.0f32;
        let p = rgba.get_pixel(0, 0);
        assert_eq!(clamp_u8((p[0] as f32 - 128.0) * factor + 128.0 + bias), p[0]);
    }
}
