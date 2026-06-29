use image::imageops;
use tauri::State;

use super::open::{build_meta, ImageMeta};
use crate::AppState;

#[tauri::command]
pub fn crop_image(
    state: State<'_, AppState>,
    tab_id: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;

    if x + width > img.width() || y + height > img.height() {
        return Err(format!(
            "Crop rect ({x},{y},{width},{height}) exceeds image bounds ({}x{})",
            img.width(),
            img.height()
        ));
    }

    let cropped = img.crop_imm(x, y, width, height);
    history.push(cropped);
    let img = history.current().ok_or("State error after crop")?;
    let meta = build_meta(img, "png", history.can_undo(), history.can_redo())?;
    Ok(meta)
}

#[tauri::command]
pub fn canvas_resize_image(
    state: State<'_, AppState>,
    tab_id: String,
    width: u32,
    height: u32,
    anchor: String,
    fill: [u8; 4],
) -> Result<ImageMeta, String> {
    if width == 0 || height == 0 {
        return Err("Width and height must be greater than 0".to_string());
    }

    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let orig_w = img.width();
    let orig_h = img.height();

    if width < orig_w || height < orig_h {
        return Err(format!(
            "Canvas size ({width}×{height}) must be >= image size ({orig_w}×{orig_h})"
        ));
    }

    let (off_x, off_y) = match anchor.as_str() {
        "top-left"      => (0, 0),
        "top-center"    => ((width - orig_w) / 2, 0),
        "top-right"     => (width - orig_w, 0),
        "middle-left"   => (0, (height - orig_h) / 2),
        "center"        => ((width - orig_w) / 2, (height - orig_h) / 2),
        "middle-right"  => (width - orig_w, (height - orig_h) / 2),
        "bottom-left"   => (0, height - orig_h),
        "bottom-center" => ((width - orig_w) / 2, height - orig_h),
        "bottom-right"  => (width - orig_w, height - orig_h),
        other => return Err(format!("Unknown anchor: {other}")),
    };

    let mut canvas = image::RgbaImage::from_pixel(width, height, image::Rgba(fill));
    image::imageops::overlay(&mut canvas, &img.to_rgba8(), off_x as i64, off_y as i64);

    history.push(image::DynamicImage::ImageRgba8(canvas));
    let img = history.current().ok_or("State error after canvas resize")?;
    let meta = build_meta(img, "png", history.can_undo(), history.can_redo())?;
    Ok(meta)
}

#[tauri::command]
pub fn resize_image(
    state: State<'_, AppState>,
    tab_id: String,
    width: u32,
    height: u32,
) -> Result<ImageMeta, String> {
    if width == 0 || height == 0 {
        return Err("Width and height must be greater than 0".to_string());
    }

    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;

    let resized = img.resize_exact(width, height, image::imageops::FilterType::Lanczos3);
    history.push(resized);
    let img = history.current().ok_or("State error after resize")?;
    let meta = build_meta(img, "png", history.can_undo(), history.can_redo())?;
    Ok(meta)
}

#[tauri::command]
pub fn flip_image(
    state: State<'_, AppState>,
    tab_id: String,
    direction: String,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;

    let flipped = match direction.as_str() {
        "horizontal" => img.fliph(),
        "vertical" => img.flipv(),
        other => return Err(format!("Unknown flip direction: {other}")),
    };

    history.push(flipped);
    let img = history.current().ok_or("State error after flip")?;
    let meta = build_meta(img, "png", history.can_undo(), history.can_redo())?;
    Ok(meta)
}

#[tauri::command]
pub fn rotate_image(
    state: State<'_, AppState>,
    tab_id: String,
    degrees: f64,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;

    let rotated = match degrees {
        d if (d - 90.0).abs() < f64::EPSILON => {
            image::DynamicImage::ImageRgba8(imageops::rotate90(&img.to_rgba8()))
        }
        d if (d - 180.0).abs() < f64::EPSILON => {
            image::DynamicImage::ImageRgba8(imageops::rotate180(&img.to_rgba8()))
        }
        d if (d - 270.0).abs() < f64::EPSILON || (d + 90.0).abs() < f64::EPSILON => {
            image::DynamicImage::ImageRgba8(imageops::rotate270(&img.to_rgba8()))
        }
        d => {
            use imageproc::geometric_transformations::{rotate_about_center, Interpolation};
            let rgba = img.to_rgba8();
            let rad = d.to_radians() as f32;
            let rotated = rotate_about_center(
                &rgba,
                rad,
                Interpolation::Bilinear,
                image::Rgba([0, 0, 0, 0]),
            );
            image::DynamicImage::ImageRgba8(rotated)
        }
    };

    history.push(rotated);
    let img = history.current().ok_or("State error after rotate")?;
    let meta = build_meta(img, "png", history.can_undo(), history.can_redo())?;
    Ok(meta)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, Rgba, RgbaImage};

    fn solid_rgba(w: u32, h: u32) -> DynamicImage {
        let mut img = RgbaImage::new(w, h);
        for p in img.pixels_mut() {
            *p = Rgba([100, 150, 200, 255]);
        }
        DynamicImage::ImageRgba8(img)
    }

    #[test]
    fn crop_produces_correct_dimensions() {
        let img = solid_rgba(100, 100);
        let cropped = img.crop_imm(10, 10, 50, 40);
        assert_eq!(cropped.width(), 50);
        assert_eq!(cropped.height(), 40);
    }

    #[test]
    fn crop_out_of_bounds_is_detected() {
        let img = solid_rgba(100, 100);
        assert!(10_u32 + 95 > img.width());
    }

    #[test]
    fn rotate_90_swaps_dimensions() {
        let img = solid_rgba(100, 200);
        let rotated = DynamicImage::ImageRgba8(imageops::rotate90(&img.to_rgba8()));
        assert_eq!(rotated.width(), 200);
        assert_eq!(rotated.height(), 100);
    }

    #[test]
    fn rotate_180_preserves_dimensions() {
        let img = solid_rgba(100, 200);
        let rotated = DynamicImage::ImageRgba8(imageops::rotate180(&img.to_rgba8()));
        assert_eq!(rotated.width(), 100);
        assert_eq!(rotated.height(), 200);
    }

    #[test]
    fn rotate_270_swaps_dimensions() {
        let img = solid_rgba(100, 200);
        let rotated = DynamicImage::ImageRgba8(imageops::rotate270(&img.to_rgba8()));
        assert_eq!(rotated.width(), 200);
        assert_eq!(rotated.height(), 100);
    }
}
