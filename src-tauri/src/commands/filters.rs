use image::{DynamicImage, imageops, GenericImageView};
use tauri::State;

use super::open::{build_meta, ImageMeta};
use crate::AppState;

// ── helpers ───────────────────────────────────────────────────────────────────

fn clamp_u8(v: f32) -> u8 {
    v.clamp(0.0, 255.0) as u8
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

fn vignette_factor(x: u32, y: u32, w: u32, h: u32, strength: f32, feather: f32) -> f32 {
    let ndx = (x as f32 / w as f32) * 2.0 - 1.0;
    let ndy = (y as f32 / h as f32) * 2.0 - 1.0;
    let dist = (ndx * ndx + ndy * ndy).sqrt() / std::f32::consts::SQRT_2;
    let t = ((dist - (1.0 - feather)) / feather.max(0.01)).clamp(0.0, 1.0);
    1.0 - strength * t * t
}

fn hash_noise(x: u32, y: u32, channel: u32) -> f32 {
    let h = x
        .wrapping_mul(2246822519)
        .wrapping_add(y.wrapping_mul(3266489917))
        .wrapping_add(channel.wrapping_mul(668265263));
    let h = h ^ (h >> 16);
    (h as f32) / (u32::MAX as f32)
}

fn adjust_saturation(r: f32, g: f32, b: f32, factor: f32) -> (f32, f32, f32) {
    let luma = 0.299 * r + 0.587 * g + 0.114 * b;
    (lerp(luma, r, factor), lerp(luma, g, factor), lerp(luma, b, factor))
}

fn adjust_contrast_pixel(v: f32, factor: f32) -> f32 {
    ((v - 128.0) * factor + 128.0).clamp(0.0, 255.0)
}

// ── commands ──────────────────────────────────────────────────────────────────

/// Convert to grayscale using custom per-channel weights.
#[tauri::command]
pub fn filter_grayscale(
    state: State<'_, AppState>,
    tab_id: String,
    r_weight: f32,
    g_weight: f32,
    b_weight: f32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let (r, g, b) = (r as f32, g as f32, b as f32);
            let luma = clamp_u8(r_weight * r + g_weight * g + b_weight * b);
            rgba.put_pixel(x, y, image::Rgba([luma, luma, luma, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Apply sepia tone with variable intensity (0.0–1.0).
#[tauri::command]
pub fn filter_sepia(
    state: State<'_, AppState>,
    tab_id: String,
    intensity: f32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let (r, g, b) = (r as f32, g as f32, b as f32);
            let sr = (0.393 * r + 0.769 * g + 0.189 * b).min(255.0);
            let sg = (0.349 * r + 0.686 * g + 0.168 * b).min(255.0);
            let sb = (0.272 * r + 0.534 * g + 0.131 * b).min(255.0);
            let nr = clamp_u8(lerp(r, sr, intensity));
            let ng = clamp_u8(lerp(g, sg, intensity));
            let nb = clamp_u8(lerp(b, sb, intensity));
            rgba.put_pixel(x, y, image::Rgba([nr, ng, nb, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Invert all colour channels (alpha preserved).
#[tauri::command]
pub fn filter_invert(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            rgba.put_pixel(x, y, image::Rgba([255 - r, 255 - g, 255 - b, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Apply a radial darkening vignette.
#[tauri::command]
pub fn filter_vignette(
    state: State<'_, AppState>,
    tab_id: String,
    strength: f32,
    feather: f32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let (r, g, b) = (r as f32, g as f32, b as f32);
            let factor = vignette_factor(x, y, w, h, strength, feather);
            let nr = clamp_u8(r * factor);
            let ng = clamp_u8(g * factor);
            let nb = clamp_u8(b * factor);
            rgba.put_pixel(x, y, image::Rgba([nr, ng, nb, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Add film grain noise. `monochrome=true` adds the same noise to all channels.
#[tauri::command]
pub fn filter_grain(
    state: State<'_, AppState>,
    tab_id: String,
    amount: f32,
    monochrome: bool,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());
    let noise_range = amount * 80.0;

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let (r, g, b) = (r as f32, g as f32, b as f32);
            let (nr, ng, nb) = if monochrome {
                let n = (hash_noise(x, y, 0) - 0.5) * noise_range;
                (clamp_u8(r + n), clamp_u8(g + n), clamp_u8(b + n))
            } else {
                let nr_n = (hash_noise(x, y, 0) - 0.5) * noise_range;
                let ng_n = (hash_noise(x, y, 1) - 0.5) * noise_range;
                let nb_n = (hash_noise(x, y, 2) - 0.5) * noise_range;
                (clamp_u8(r + nr_n), clamp_u8(g + ng_n), clamp_u8(b + nb_n))
            };
            rgba.put_pixel(x, y, image::Rgba([nr, ng, nb, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Pixelate the image into blocks of the given size.
#[tauri::command]
pub fn filter_pixelate(
    state: State<'_, AppState>,
    tab_id: String,
    size: u32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let orig = img.to_rgba8();
    let (w, h) = (orig.width(), orig.height());
    let size = size.max(1);
    let mut result = orig.clone();

    for y in 0..h {
        for x in 0..w {
            let bx = (x / size) * size;
            let by = (y / size) * size;
            let sx = (bx + size / 2).min(w - 1);
            let sy = (by + size / 2).min(h - 1);
            let p = *orig.get_pixel(sx, sy);
            result.put_pixel(x, y, p);
        }
    }

    let new_img = DynamicImage::ImageRgba8(result);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Reduce the number of distinct colour values per channel.
#[tauri::command]
pub fn filter_posterize(
    state: State<'_, AppState>,
    tab_id: String,
    levels: u8,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());
    let levels = levels.max(2);
    let step = 255.0 / (levels as f32 - 1.0);

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let quantize = |c: u8| clamp_u8((c as f32 / step).round() * step);
            rgba.put_pixel(x, y, image::Rgba([quantize(r), quantize(g), quantize(b), a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Map shadows to one colour and highlights to another.
#[tauri::command]
pub fn filter_duotone(
    state: State<'_, AppState>,
    tab_id: String,
    shadow_r: u8,
    shadow_g: u8,
    shadow_b: u8,
    highlight_r: u8,
    highlight_g: u8,
    highlight_b: u8,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let (r, g, b) = (r as f32, g as f32, b as f32);
            let luma = 0.299 * r + 0.587 * g + 0.114 * b;
            let t = luma / 255.0;
            let nr = clamp_u8(lerp(shadow_r as f32, highlight_r as f32, t));
            let ng = clamp_u8(lerp(shadow_g as f32, highlight_g as f32, t));
            let nb = clamp_u8(lerp(shadow_b as f32, highlight_b as f32, t));
            rgba.put_pixel(x, y, image::Rgba([nr, ng, nb, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Pencil-sketch effect via colour-dodge blend of grayscale and blurred-inverted layers.
#[tauri::command]
pub fn filter_sketch(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let (w, h) = img.dimensions();

    // Step 1: grayscale
    let mut gray_img = img.to_rgba8();
    for y in 0..h {
        for x in 0..w {
            let p = gray_img.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let luma = clamp_u8(0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32);
            gray_img.put_pixel(x, y, image::Rgba([luma, luma, luma, a]));
        }
    }

    // Step 2: invert
    let mut inverted = gray_img.clone();
    for y in 0..h {
        for x in 0..w {
            let p = inverted.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            inverted.put_pixel(x, y, image::Rgba([255 - r, 255 - g, 255 - b, a]));
        }
    }

    // Step 3: blur the inverted image
    let dyn_inverted = DynamicImage::ImageRgba8(inverted);
    let blurred_img = imageops::blur(&dyn_inverted.to_rgba8(), 8.0);

    // Step 4: colour dodge blend
    let mut result = gray_img.clone();
    for y in 0..h {
        for x in 0..w {
            let gp = gray_img.get_pixel(x, y);
            let bp = blurred_img.get_pixel(x, y);
            let gray_val = gp.0[0] as f32;
            let blur_val = bp.0[0] as f32;
            let a = gp.0[3];
            let dodged = if blur_val >= 255.0 {
                255
            } else {
                clamp_u8((gray_val * 255.0 / (255.0 - blur_val)).min(255.0))
            };
            result.put_pixel(x, y, image::Rgba([dodged, dodged, dodged, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(result);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Lomo-style film effect: saturated, high-contrast, with strong vignette.
#[tauri::command]
pub fn filter_lomo(
    state: State<'_, AppState>,
    tab_id: String,
    intensity: f32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    let sat_factor = 1.0 + intensity * 0.5;
    let contrast_factor = 1.0 + intensity * 0.3;
    let darken = 1.0 - intensity * 0.1;

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let (r, g, b) = (r as f32, g as f32, b as f32);

            // Boost saturation
            let (r, g, b) = adjust_saturation(r, g, b, sat_factor);

            // Boost contrast
            let r = adjust_contrast_pixel(r, contrast_factor);
            let g = adjust_contrast_pixel(g, contrast_factor);
            let b = adjust_contrast_pixel(b, contrast_factor);

            // Darken
            let r = r * darken;
            let g = g * darken;
            let b = b * darken;

            // Vignette
            let vf = vignette_factor(x, y, w, h, intensity * 0.7, 0.5);
            let nr = clamp_u8(r * vf);
            let ng = clamp_u8(g * vf);
            let nb = clamp_u8(b * vf);
            rgba.put_pixel(x, y, image::Rgba([nr, ng, nb, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Vintage film look: slight sepia, lifted blacks, warm shift.
#[tauri::command]
pub fn filter_vintage(
    state: State<'_, AppState>,
    tab_id: String,
    intensity: f32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let (r, g, b) = (r as f32, g as f32, b as f32);

            // Sepia 35%
            let sr = (0.393 * r + 0.769 * g + 0.189 * b).min(255.0);
            let sg = (0.349 * r + 0.686 * g + 0.168 * b).min(255.0);
            let sb = (0.272 * r + 0.534 * g + 0.131 * b).min(255.0);
            let r = lerp(r, sr, 0.35 * intensity);
            let g = lerp(g, sg, 0.35 * intensity);
            let b = lerp(b, sb, 0.35 * intensity);

            // Lift blacks
            let r = r + 25.0 * intensity;
            let g = g + 25.0 * intensity;
            let b = b + 25.0 * intensity;

            // Reduce contrast
            let r = (r - 128.0) * (1.0 - 0.15 * intensity) + 128.0;
            let g = (g - 128.0) * (1.0 - 0.15 * intensity) + 128.0;
            let b = (b - 128.0) * (1.0 - 0.15 * intensity) + 128.0;

            // Warm shift
            let r = r + 10.0 * intensity;
            let b = b - 8.0 * intensity;

            let nr = clamp_u8(r);
            let ng = clamp_u8(g);
            let nb = clamp_u8(b);
            rgba.put_pixel(x, y, image::Rgba([nr, ng, nb, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Cool-toned colour grade: reduce red, boost blue.
#[tauri::command]
pub fn filter_cool(
    state: State<'_, AppState>,
    tab_id: String,
    intensity: f32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let (r, g, b) = (r as f32, g as f32, b as f32);
            let nr = clamp_u8(r - 20.0 * intensity);
            let ng = clamp_u8(g + 5.0 * intensity);
            let nb = clamp_u8(b + 25.0 * intensity);
            rgba.put_pixel(x, y, image::Rgba([nr, ng, nb, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Warm-toned colour grade: boost red, reduce blue.
#[tauri::command]
pub fn filter_warm(
    state: State<'_, AppState>,
    tab_id: String,
    intensity: f32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let (r, g, b) = (r as f32, g as f32, b as f32);
            let nr = clamp_u8(r + 25.0 * intensity);
            let ng = clamp_u8(g + 10.0 * intensity);
            let nb = clamp_u8(b - 20.0 * intensity);
            rgba.put_pixel(x, y, image::Rgba([nr, ng, nb, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Faded/matte look: lifted blacks, reduced contrast, slight desaturation.
#[tauri::command]
pub fn filter_fade(
    state: State<'_, AppState>,
    tab_id: String,
    intensity: f32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let (r, g, b) = (r as f32, g as f32, b as f32);

            // Lift blacks
            let r = r + 40.0 * intensity;
            let g = g + 40.0 * intensity;
            let b = b + 40.0 * intensity;

            // Reduce contrast
            let r = (r - 128.0) * (1.0 - 0.3 * intensity) + 128.0;
            let g = (g - 128.0) * (1.0 - 0.3 * intensity) + 128.0;
            let b = (b - 128.0) * (1.0 - 0.3 * intensity) + 128.0;

            // Desaturate
            let (r, g, b) = adjust_saturation(r, g, b, 1.0 - 0.15 * intensity);

            let nr = clamp_u8(r);
            let ng = clamp_u8(g);
            let nb = clamp_u8(b);
            rgba.put_pixel(x, y, image::Rgba([nr, ng, nb, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// High-drama look: punchy contrast, darkened, slightly desaturated.
#[tauri::command]
pub fn filter_drama(
    state: State<'_, AppState>,
    tab_id: String,
    intensity: f32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let (r, g, b) = (r as f32, g as f32, b as f32);

            // High contrast
            let r = (r - 128.0) * (1.0 + 0.5 * intensity) + 128.0;
            let g = (g - 128.0) * (1.0 + 0.5 * intensity) + 128.0;
            let b = (b - 128.0) * (1.0 + 0.5 * intensity) + 128.0;

            // Darken
            let darken = 1.0 - 0.15 * intensity;
            let r = r * darken;
            let g = g * darken;
            let b = b * darken;

            // Slight desaturate
            let (r, g, b) = adjust_saturation(r, g, b, 1.0 - 0.2 * intensity);

            let nr = clamp_u8(r);
            let ng = clamp_u8(g);
            let nb = clamp_u8(b);
            rgba.put_pixel(x, y, image::Rgba([nr, ng, nb, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Cross-processing effect: skewed colour channels, boosted saturation and contrast.
#[tauri::command]
pub fn filter_cross_process(
    state: State<'_, AppState>,
    tab_id: String,
    intensity: f32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let mut rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let [r, g, b, a] = p.0;
            let (r, g, b) = (r as f32, g as f32, b as f32);

            // Boost green
            let g = g + 20.0 * intensity;

            // Boost blue in highlights
            let b = b + (b / 255.0) * 30.0 * intensity;

            // Boost red in shadows
            let r = r + (1.0 - r / 255.0) * 20.0 * intensity;

            // Increase contrast
            let contrast_factor = 1.0 + 0.2 * intensity;
            let r = (r - 128.0) * contrast_factor + 128.0;
            let g = (g - 128.0) * contrast_factor + 128.0;
            let b = (b - 128.0) * contrast_factor + 128.0;

            // Boost saturation
            let sat_factor = 1.0 + 0.3 * intensity;
            let (r, g, b) = adjust_saturation(r, g, b, sat_factor);

            let nr = clamp_u8(r);
            let ng = clamp_u8(g);
            let nb = clamp_u8(b);
            rgba.put_pixel(x, y, image::Rgba([nr, ng, nb, a]));
        }
    }

    let new_img = DynamicImage::ImageRgba8(rgba);
    history.push(new_img);
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Gaussian blur with adjustable radius.
#[tauri::command]
pub fn filter_blur_gaussian(
    state: State<'_, AppState>,
    tab_id: String,
    radius: f32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let blurred = imageops::blur(&img.to_rgba8(), radius.max(0.1));
    history.push(DynamicImage::ImageRgba8(blurred));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Motion blur along a given angle (degrees) over a given distance (pixels).
#[tauri::command]
pub fn filter_blur_motion(
    state: State<'_, AppState>,
    tab_id: String,
    angle: f32,    // 0–360°
    distance: u32, // 1–100 px (half-kernel radius)
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());
    let distance = distance.clamp(1, 100) as i32;

    let rad = angle.to_radians();
    let dx = rad.cos();
    let dy = rad.sin();

    let mut result = rgba.clone();
    for y in 0..h {
        for x in 0..w {
            let mut r_sum = 0f32;
            let mut g_sum = 0f32;
            let mut b_sum = 0f32;
            let mut count = 0f32;

            for i in -distance..=distance {
                let sx = (x as f32 + i as f32 * dx).round() as i32;
                let sy = (y as f32 + i as f32 * dy).round() as i32;
                if sx >= 0 && sx < w as i32 && sy >= 0 && sy < h as i32 {
                    let p = rgba.get_pixel(sx as u32, sy as u32);
                    r_sum += p[0] as f32;
                    g_sum += p[1] as f32;
                    b_sum += p[2] as f32;
                    count += 1.0;
                }
            }

            if count > 0.0 {
                let a = rgba.get_pixel(x, y)[3];
                result.put_pixel(x, y, image::Rgba([
                    clamp_u8(r_sum / count),
                    clamp_u8(g_sum / count),
                    clamp_u8(b_sum / count),
                    a,
                ]));
            }
        }
    }

    history.push(DynamicImage::ImageRgba8(result));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

/// Radial (zoom) blur from the image centre.
#[tauri::command]
pub fn filter_blur_radial(
    state: State<'_, AppState>,
    tab_id: String,
    strength: f32, // 0.0–1.0
    samples: u32,  // 4–32
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());
    let samples = samples.clamp(4, 32);
    let cx = w as f32 / 2.0;
    let cy = h as f32 / 2.0;

    let mut result = rgba.clone();
    for y in 0..h {
        for x in 0..w {
            let mut r_sum = 0f32;
            let mut g_sum = 0f32;
            let mut b_sum = 0f32;

            for i in 0..samples {
                let t = if samples > 1 { i as f32 / (samples - 1) as f32 } else { 0.0 };
                let scale = 1.0 - t * strength.clamp(0.0, 0.95);
                let sx = (cx + (x as f32 - cx) * scale).round().clamp(0.0, (w - 1) as f32) as u32;
                let sy = (cy + (y as f32 - cy) * scale).round().clamp(0.0, (h - 1) as f32) as u32;
                let p = rgba.get_pixel(sx, sy);
                r_sum += p[0] as f32;
                g_sum += p[1] as f32;
                b_sum += p[2] as f32;
            }

            let a = rgba.get_pixel(x, y)[3];
            result.put_pixel(x, y, image::Rgba([
                clamp_u8(r_sum / samples as f32),
                clamp_u8(g_sum / samples as f32),
                clamp_u8(b_sum / samples as f32),
                a,
            ]));
        }
    }

    history.push(DynamicImage::ImageRgba8(result));
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
    fn invert_double_is_identity() {
        let original = solid(100, 150, 200);
        let rgba = original.to_rgba8();

        // Invert once
        let mut once = rgba.clone();
        for p in once.pixels_mut() {
            let [r, g, b, a] = p.0;
            *p = Rgba([255 - r, 255 - g, 255 - b, a]);
        }

        // Invert twice
        let mut twice = once.clone();
        for p in twice.pixels_mut() {
            let [r, g, b, a] = p.0;
            *p = Rgba([255 - r, 255 - g, 255 - b, a]);
        }

        // Should match original
        let orig_px = rgba.get_pixel(0, 0);
        let twice_px = twice.get_pixel(0, 0);
        assert_eq!(orig_px, twice_px);
    }

    #[test]
    fn sepia_on_grayscale_stays_close_to_grayscale() {
        // A neutral gray input should produce r >= g >= b (warm shift) but close values
        let gray_val = 128u8;
        let r = gray_val as f32;
        let g = gray_val as f32;
        let b = gray_val as f32;

        let sr = (0.393 * r + 0.769 * g + 0.189 * b).min(255.0);
        let sg = (0.349 * r + 0.686 * g + 0.168 * b).min(255.0);
        let sb = (0.272 * r + 0.534 * g + 0.131 * b).min(255.0);

        // Sepia of a gray should have r >= g >= b (standard sepia warm cast)
        assert!(sr >= sg, "sepia red should be >= sepia green");
        assert!(sg >= sb, "sepia green should be >= sepia blue");
    }

    #[test]
    fn posterize_quantizes_correctly() {
        let levels = 4u8;
        let step = 255.0 / (levels as f32 - 1.0); // 85.0

        // 0 → 0, 42 → 0, 43 → 85, 127 → 85, 128 → 170, 255 → 255
        let quantize = |c: u8| clamp_u8((c as f32 / step).round() * step);

        assert_eq!(quantize(0), 0);
        assert_eq!(quantize(42), 0);
        assert_eq!(quantize(43), 85);
        assert_eq!(quantize(127), 85);
        assert_eq!(quantize(128), 170);
        assert_eq!(quantize(255), 255);
    }

    #[test]
    fn vignette_factor_center_is_one() {
        let w = 100u32;
        let h = 100u32;
        // Centre pixel: (50, 50) → ndx=0, ndy=0, dist=0
        // dist < (1 - feather) so t clamped to 0, factor = 1.0
        let f = vignette_factor(50, 50, w, h, 1.0, 0.5);
        assert!((f - 1.0).abs() < 0.01, "centre factor should be ~1.0, got {f}");
    }

    #[test]
    fn vignette_factor_corner_less_than_center() {
        let w = 100u32;
        let h = 100u32;
        let center = vignette_factor(50, 50, w, h, 0.8, 0.5);
        let corner = vignette_factor(0, 0, w, h, 0.8, 0.5);
        assert!(
            corner < center,
            "corner factor ({corner}) should be less than center factor ({center})"
        );
    }

    #[test]
    fn gaussian_blur_preserves_size() {
        let img = solid(128, 64, 32);
        let rgba = img.to_rgba8();
        let blurred = imageops::blur(&rgba, 2.0);
        assert_eq!(blurred.width(), rgba.width());
        assert_eq!(blurred.height(), rgba.height());
    }

    #[test]
    fn motion_blur_uniform_image_is_unchanged() {
        // A perfectly uniform image should be unchanged by any linear blur
        let img = solid(100, 150, 200);
        let rgba = img.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());
        let dx = 1.0f32; // horizontal
        let dy = 0.0f32;
        let distance = 5i32;
        let mut result = rgba.clone();
        for y in 0..h {
            for x in 0..w {
                let mut r_sum = 0f32; let mut g_sum = 0f32; let mut b_sum = 0f32; let mut count = 0f32;
                for i in -distance..=distance {
                    let sx = (x as f32 + i as f32 * dx).round() as i32;
                    let sy = (y as f32 + i as f32 * dy).round() as i32;
                    if sx >= 0 && sx < w as i32 && sy >= 0 && sy < h as i32 {
                        let p = rgba.get_pixel(sx as u32, sy as u32);
                        r_sum += p[0] as f32; g_sum += p[1] as f32; b_sum += p[2] as f32; count += 1.0;
                    }
                }
                if count > 0.0 {
                    let a = rgba.get_pixel(x, y)[3];
                    result.put_pixel(x, y, image::Rgba([clamp_u8(r_sum / count), clamp_u8(g_sum / count), clamp_u8(b_sum / count), a]));
                }
            }
        }
        // Every pixel should still be 100, 150, 200
        for p in result.pixels() { assert_eq!(p[0], 100); assert_eq!(p[1], 150); assert_eq!(p[2], 200); }
    }

    #[test]
    fn radial_blur_uniform_image_is_unchanged() {
        let img = solid(80, 120, 200);
        let rgba = img.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());
        let samples = 8u32;
        let strength = 0.5f32;
        let cx = w as f32 / 2.0; let cy = h as f32 / 2.0;
        let mut result = rgba.clone();
        for y in 0..h {
            for x in 0..w {
                let mut r_sum = 0f32; let mut g_sum = 0f32; let mut b_sum = 0f32;
                for i in 0..samples {
                    let t = if samples > 1 { i as f32 / (samples - 1) as f32 } else { 0.0 };
                    let scale = 1.0 - t * strength;
                    let sx = (cx + (x as f32 - cx) * scale).round().clamp(0.0, (w - 1) as f32) as u32;
                    let sy = (cy + (y as f32 - cy) * scale).round().clamp(0.0, (h - 1) as f32) as u32;
                    let p = rgba.get_pixel(sx, sy);
                    r_sum += p[0] as f32; g_sum += p[1] as f32; b_sum += p[2] as f32;
                }
                let a = rgba.get_pixel(x, y)[3];
                result.put_pixel(x, y, image::Rgba([clamp_u8(r_sum / samples as f32), clamp_u8(g_sum / samples as f32), clamp_u8(b_sum / samples as f32), a]));
            }
        }
        for p in result.pixels() { assert_eq!(p[0], 80); assert_eq!(p[1], 120); assert_eq!(p[2], 200); }
    }

    #[test]
    fn hash_noise_range_zero_to_one() {
        // Sample a grid of positions and verify all values are in [0, 1]
        for y in 0u32..8 {
            for x in 0u32..8 {
                for ch in 0u32..3 {
                    let n = hash_noise(x, y, ch);
                    assert!(
                        (0.0..=1.0).contains(&n),
                        "hash_noise({x},{y},{ch}) = {n} is out of [0,1]"
                    );
                }
            }
        }
    }
}
