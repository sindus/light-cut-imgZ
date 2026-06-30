use exif::In;
use img_parts::ImageEXIF;
use serde::Serialize;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::AppState;

#[derive(Serialize)]
pub struct ExifField {
    pub tag: String,
    pub value: String,
}

#[tauri::command]
pub async fn get_exif(state: State<'_, AppState>, tab_id: String) -> Result<Vec<ExifField>, String> {
    let source_path = {
        let map = state.0.lock().map_err(|e| e.to_string())?;
        let history = map.get(&tab_id).ok_or("Tab not found")?;
        history.source_path.clone()
    };

    let Some(path) = source_path else {
        return Ok(vec![]);
    };

    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buf = std::io::BufReader::new(file);
    let reader = exif::Reader::new();

    let exif_data = match reader.read_from_container(&mut buf) {
        Ok(data) => data,
        Err(_) => return Ok(vec![]),
    };

    let fields = exif_data
        .fields()
        .filter(|f| f.ifd_num == In::PRIMARY)
        .map(|f| ExifField {
            tag: f.tag.to_string(),
            value: f.display_value().with_unit(&exif_data).to_string(),
        })
        .collect();

    Ok(fields)
}

#[tauri::command]
pub async fn strip_exif(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<bool, String> {
    let source_path = {
        let map = state.0.lock().map_err(|e| e.to_string())?;
        let history = map.get(&tab_id).ok_or("Tab not found")?;
        history.source_path.clone()
    };

    let ext = source_path
        .as_ref()
        .and_then(|p| p.extension())
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    let filter_ext = if ext == "jpg" || ext == "jpeg" { "jpg" } else { &ext };

    let save_path = app
        .dialog()
        .file()
        .add_filter("Image", &[filter_ext])
        .set_file_name(format!("stripped.{filter_ext}"))
        .blocking_save_file();

    let Some(save_path) = save_path else {
        return Ok(false);
    };
    let output = save_path.into_path().map_err(|e| e.to_string())?;

    if (ext == "jpg" || ext == "jpeg") && source_path.is_some() {
        // Lossless EXIF removal for JPEG
        let data = std::fs::read(source_path.as_deref().ok_or("No source path")?).map_err(|e| e.to_string())?;
        let mut jpeg = img_parts::jpeg::Jpeg::from_bytes(data.into())
            .map_err(|e| e.to_string())?;
        jpeg.set_exif(None);
        std::fs::write(&output, jpeg.encoder().bytes()).map_err(|e| e.to_string())?;
    } else {
        // Re-encode with image crate (EXIF already stripped by decode/encode cycle)
        let map = state.0.lock().map_err(|e| e.to_string())?;
        let history = map.get(&tab_id).ok_or("Tab not found")?;
        let img = history.current().ok_or("No image loaded")?;
        img.save(&output).map_err(|e| e.to_string())?;
    }

    Ok(true)
}
