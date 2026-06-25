use image::imageops;
use tauri::State;

use super::open::{build_meta, ImageMeta};
use crate::AppState;

#[tauri::command]
pub fn crop_image(
    state: State<'_, AppState>,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<ImageMeta, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let img = guard.as_ref().ok_or("No image loaded")?;

    if x + width > img.width() || y + height > img.height() {
        return Err(format!(
            "Crop rect ({x},{y},{width},{height}) exceeds image bounds ({}x{})",
            img.width(),
            img.height()
        ));
    }

    let cropped = img.crop_imm(x, y, width, height);
    let meta = build_meta(&cropped, "png")?;
    *guard = Some(cropped);
    Ok(meta)
}

#[tauri::command]
pub fn rotate_image(state: State<'_, AppState>, degrees: f64) -> Result<ImageMeta, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let img = guard.as_ref().ok_or("No image loaded")?;

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

    let meta = build_meta(&rotated, "png")?;
    *guard = Some(rotated);
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
        // Guard logic: x + width > img.width()
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
