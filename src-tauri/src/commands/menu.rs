use std::sync::Mutex;
use tauri::State;

use crate::LangMenuState;

#[tauri::command]
pub fn set_language_check(state: State<'_, Mutex<LangMenuState>>, lang: String) {
    if let Ok(s) = state.lock() {
        let _ = s.en.set_checked(lang == "en");
        let _ = s.fr.set_checked(lang == "fr");
    }
}
