use base64::Engine;
use image::ImageFormat;
use serde::Serialize;
use std::io::Cursor;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::AppState;

#[derive(Serialize, Clone)]
pub struct ImageMeta {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub preview: String,
    pub can_undo: bool,
    pub can_redo: bool,
}

pub fn encode_preview(img: &image::DynamicImage) -> Result<String, String> {
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    Ok(format!("data:image/png;base64,{b64}"))
}

pub fn build_meta(
    img: &image::DynamicImage,
    format: &str,
    can_undo: bool,
    can_redo: bool,
) -> Result<ImageMeta, String> {
    Ok(ImageMeta {
        width: img.width(),
        height: img.height(),
        format: format.to_string(),
        preview: encode_preview(img)?,
        can_undo,
        can_redo,
    })
}

#[tauri::command]
pub async fn open_image(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<ImageMeta>, String> {
    let file = app
        .dialog()
        .file()
        .add_filter(
            "Images",
            &["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"],
        )
        .blocking_pick_file();

    let Some(path) = file else {
        return Ok(None);
    };

    let path_buf = path.into_path().map_err(|e| e.to_string())?;
    let format = image::ImageReader::open(&path_buf)
        .map_err(|e| e.to_string())?
        .format()
        .map(|f| format!("{f:?}").to_lowercase())
        .unwrap_or_else(|| "unknown".to_string());

    let img = image::open(&path_buf).map_err(|e| e.to_string())?;

    let mut history = state.0.lock().map_err(|e| e.to_string())?;
    let meta = build_meta(&img, &format, false, false)?;
    history.open(img);

    Ok(Some(meta))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, Rgba, RgbaImage};

    fn solid_image(w: u32, h: u32) -> DynamicImage {
        let mut img = RgbaImage::new(w, h);
        for pixel in img.pixels_mut() {
            *pixel = Rgba([255, 0, 0, 255]);
        }
        DynamicImage::ImageRgba8(img)
    }

    #[test]
    fn encode_preview_produces_data_url() {
        let img = solid_image(10, 10);
        let result = encode_preview(&img).unwrap();
        assert!(result.starts_with("data:image/png;base64,"));
        assert!(result.len() > 22);
    }

    #[test]
    fn build_meta_returns_correct_dimensions() {
        let img = solid_image(100, 80);
        let meta = build_meta(&img, "png", false, false).unwrap();
        assert_eq!(meta.width, 100);
        assert_eq!(meta.height, 80);
        assert_eq!(meta.format, "png");
        assert!(meta.preview.starts_with("data:image/png;base64,"));
    }
}
