use tauri::State;

use super::open::{build_meta, ImageMeta};
use crate::AppState;

#[tauri::command]
pub fn undo_image(state: State<'_, AppState>, tab_id: String) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    if !history.can_undo() {
        return Err("Nothing to undo".to_string());
    }
    let img = history.undo().ok_or("Undo failed")?.clone();
    let can_undo = history.can_undo();
    let can_redo = history.can_redo();
    build_meta(&img, "png", can_undo, can_redo)
}

#[tauri::command]
pub fn redo_image(state: State<'_, AppState>, tab_id: String) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    if !history.can_redo() {
        return Err("Nothing to redo".to_string());
    }
    let img = history.redo().ok_or("Redo failed")?.clone();
    let can_undo = history.can_undo();
    let can_redo = history.can_redo();
    build_meta(&img, "png", can_undo, can_redo)
}

#[tauri::command]
pub fn reset_to_original(state: State<'_, AppState>, tab_id: String) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    if history.entries.is_empty() {
        return Err("No history".to_string());
    }
    history.index = Some(0);
    let img = history.entries[0].clone();
    let can_undo = history.can_undo();
    let can_redo = history.can_redo();
    build_meta(&img, "png", can_undo, can_redo)
}
