use base64::Engine;
use image::ImageFormat;
use serde::Serialize;
use std::io::Cursor;
use std::path::PathBuf;
use tauri::State;
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::{AppHistory, AppState};

#[derive(Serialize, Clone)]
pub struct ImageMeta {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub preview: String,
    pub can_undo: bool,
    pub can_redo: bool,
    pub filename: Option<String>,
    pub path: Option<String>,
}

#[derive(Serialize)]
pub struct OpenedImage {
    pub tab_id: String,
    pub meta: ImageMeta,
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
        filename: None,
        path: None,
    })
}

fn load_image_from_path(path_buf: PathBuf) -> Result<(String, ImageMeta, AppHistory), String> {
    let filename = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string());

    let path_str = path_buf.to_str().map(|s| s.to_string());

    let format = image::ImageReader::open(&path_buf)
        .map_err(|e| e.to_string())?
        .format()
        .map(|f| format!("{f:?}").to_lowercase())
        .unwrap_or_else(|| "unknown".to_string());

    let img = image::open(&path_buf).map_err(|e| e.to_string())?;

    let mut meta = build_meta(&img, &format, false, false)?;
    meta.filename = filename;
    meta.path = path_str;

    let mut history = AppHistory::new();
    history.source_path = Some(path_buf);
    history.open(img);

    Ok((Uuid::new_v4().to_string(), meta, history))
}

fn batch_insert(
    loaded: Vec<(String, ImageMeta, AppHistory)>,
    state: &State<'_, AppState>,
) -> Result<Vec<OpenedImage>, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let mut results = Vec::with_capacity(loaded.len());
    for (tab_id, meta, history) in loaded {
        map.insert(tab_id.clone(), history);
        results.push(OpenedImage { tab_id, meta });
    }
    Ok(results)
}

#[tauri::command]
pub async fn open_images(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<OpenedImage>, String> {
    let files = app
        .dialog()
        .file()
        .add_filter(
            "Images",
            &["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"],
        )
        .blocking_pick_files();

    let Some(paths) = files else {
        return Ok(vec![]);
    };

    let mut loaded = Vec::new();
    for path in paths {
        let path_buf = path.into_path().map_err(|e| e.to_string())?;
        loaded.push(load_image_from_path(path_buf)?);
    }

    batch_insert(loaded, &state)
}

#[tauri::command]
pub async fn open_images_by_paths(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<OpenedImage>, String> {
    const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"];

    let mut loaded = Vec::new();
    for path_str in paths {
        let path_buf = PathBuf::from(&path_str);
        let ext = path_buf
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !IMAGE_EXTS.contains(&ext.as_str()) {
            continue;
        }
        if let Ok(item) = load_image_from_path(path_buf) {
            loaded.push(item);
        }
    }

    if loaded.is_empty() {
        return Ok(vec![]);
    }

    batch_insert(loaded, &state)
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
        assert!(meta.filename.is_none());
        assert!(meta.path.is_none());
    }
}
