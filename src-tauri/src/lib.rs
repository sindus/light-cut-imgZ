use image::DynamicImage;
use std::sync::Mutex;

pub mod commands;

pub struct AppState(pub Mutex<Option<DynamicImage>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::open::open_image,
            commands::transform::crop_image,
            commands::transform::rotate_image,
            commands::export::export_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
