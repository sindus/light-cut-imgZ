use tauri::State;

use super::open::{build_meta, ImageMeta};
use crate::AppState;

#[tauri::command]
pub fn undo_image(state: State<'_, AppState>) -> Result<ImageMeta, String> {
    let mut history = state.0.lock().map_err(|e| e.to_string())?;
    if !history.can_undo() {
        return Err("Nothing to undo".to_string());
    }
    // Clone image to release the mutable borrow before querying can_undo/can_redo
    let img = history.undo().ok_or("Undo failed")?.clone();
    let can_undo = history.can_undo();
    let can_redo = history.can_redo();
    build_meta(&img, "png", can_undo, can_redo)
}

#[tauri::command]
pub fn redo_image(state: State<'_, AppState>) -> Result<ImageMeta, String> {
    let mut history = state.0.lock().map_err(|e| e.to_string())?;
    if !history.can_redo() {
        return Err("Nothing to redo".to_string());
    }
    let img = history.redo().ok_or("Redo failed")?.clone();
    let can_undo = history.can_undo();
    let can_redo = history.can_redo();
    build_meta(&img, "png", can_undo, can_redo)
}
