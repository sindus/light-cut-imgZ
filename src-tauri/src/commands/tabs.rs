use tauri::State;

use crate::AppState;

#[tauri::command]
pub fn close_tab(state: State<'_, AppState>, tab_id: String) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    map.remove(&tab_id);
    Ok(())
}

#[tauri::command]
pub fn close_all_tabs(state: State<'_, AppState>) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    map.clear();
    Ok(())
}

#[tauri::command]
pub fn close_other_tabs(state: State<'_, AppState>, tab_id: String) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    map.retain(|k, _| k == &tab_id);
    Ok(())
}
