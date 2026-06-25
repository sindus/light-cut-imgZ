use image::ImageFormat;
use std::io::BufWriter;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::AppState;

fn format_from_str(format: &str) -> Result<ImageFormat, String> {
    match format {
        "png" => Ok(ImageFormat::Png),
        "jpeg" | "jpg" => Ok(ImageFormat::Jpeg),
        "webp" => Ok(ImageFormat::WebP),
        "bmp" => Ok(ImageFormat::Bmp),
        "tiff" | "tif" => Ok(ImageFormat::Tiff),
        other => Err(format!("Unsupported format: {other}")),
    }
}

fn extension_for(fmt: ImageFormat) -> &'static str {
    match fmt {
        ImageFormat::Png => "png",
        ImageFormat::Jpeg => "jpg",
        ImageFormat::WebP => "webp",
        ImageFormat::Bmp => "bmp",
        ImageFormat::Tiff => "tiff",
        _ => "bin",
    }
}

#[tauri::command]
pub async fn export_image(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    format: String,
    quality: Option<u8>,
) -> Result<(), String> {
    let img_format = format_from_str(&format)?;
    let ext = extension_for(img_format);

    let path = app
        .dialog()
        .file()
        .add_filter("Image", &[ext])
        .set_file_name(format!("export.{ext}"))
        .blocking_save_file();

    let Some(path) = path else {
        return Ok(());
    };

    let path_buf = path.into_path().map_err(|e| e.to_string())?;

    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let img = guard.as_ref().ok_or("No image loaded")?;

    let file = std::fs::File::create(&path_buf).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(file);

    match img_format {
        ImageFormat::Jpeg => {
            let q = quality.unwrap_or(90).clamp(1, 100);
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, q);
            img.write_with_encoder(encoder).map_err(|e| e.to_string())?;
        }
        ImageFormat::WebP => {
            let encoder = image::codecs::webp::WebPEncoder::new_lossless(&mut writer);
            img.write_with_encoder(encoder).map_err(|e| e.to_string())?;
        }
        _ => {
            img.write_to(&mut writer, img_format)
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_from_str_maps_known_formats() {
        assert!(matches!(format_from_str("png"), Ok(ImageFormat::Png)));
        assert!(matches!(format_from_str("jpeg"), Ok(ImageFormat::Jpeg)));
        assert!(matches!(format_from_str("jpg"), Ok(ImageFormat::Jpeg)));
        assert!(matches!(format_from_str("webp"), Ok(ImageFormat::WebP)));
        assert!(matches!(format_from_str("bmp"), Ok(ImageFormat::Bmp)));
        assert!(matches!(format_from_str("tiff"), Ok(ImageFormat::Tiff)));
        assert!(matches!(format_from_str("tif"), Ok(ImageFormat::Tiff)));
    }

    #[test]
    fn format_from_str_rejects_unknown() {
        assert!(format_from_str("gif").is_err());
        assert!(format_from_str("svg").is_err());
        assert!(format_from_str("").is_err());
    }
}
