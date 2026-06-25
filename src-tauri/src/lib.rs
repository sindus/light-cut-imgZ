use image::DynamicImage;
use std::sync::Mutex;

pub mod commands;

pub struct AppHistory {
    pub entries: Vec<DynamicImage>,
    pub index: Option<usize>,
}

impl Default for AppHistory {
    fn default() -> Self {
        Self::new()
    }
}

impl AppHistory {
    pub fn new() -> Self {
        AppHistory {
            entries: Vec::new(),
            index: None,
        }
    }

    pub fn current(&self) -> Option<&DynamicImage> {
        self.index.map(|i| &self.entries[i])
    }

    pub fn push(&mut self, image: DynamicImage) {
        if let Some(i) = self.index {
            self.entries.truncate(i + 1);
        }
        self.entries.push(image);
        self.index = Some(self.entries.len() - 1);
    }

    pub fn open(&mut self, image: DynamicImage) {
        self.entries.clear();
        self.index = None;
        self.push(image);
    }

    pub fn undo(&mut self) -> Option<&DynamicImage> {
        let i = self.index?;
        if i == 0 {
            return None;
        }
        self.index = Some(i - 1);
        Some(&self.entries[i - 1])
    }

    pub fn redo(&mut self) -> Option<&DynamicImage> {
        let i = self.index?;
        if i + 1 >= self.entries.len() {
            return None;
        }
        self.index = Some(i + 1);
        Some(&self.entries[i + 1])
    }

    pub fn can_undo(&self) -> bool {
        self.index.map(|i| i > 0).unwrap_or(false)
    }

    pub fn can_redo(&self) -> bool {
        self.index
            .map(|i| i + 1 < self.entries.len())
            .unwrap_or(false)
    }
}

pub struct AppState(pub Mutex<AppHistory>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState(Mutex::new(AppHistory::new())))
        .invoke_handler(tauri::generate_handler![
            commands::open::open_image,
            commands::transform::crop_image,
            commands::transform::rotate_image,
            commands::export::export_image,
            commands::history::undo_image,
            commands::history::redo_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, Rgba, RgbaImage};

    fn img(w: u32, h: u32) -> DynamicImage {
        let mut i = RgbaImage::new(w, h);
        for p in i.pixels_mut() {
            *p = Rgba([0, 0, 0, 255]);
        }
        DynamicImage::ImageRgba8(i)
    }

    #[test]
    fn history_starts_empty() {
        let h = AppHistory::new();
        assert!(h.current().is_none());
        assert!(!h.can_undo());
        assert!(!h.can_redo());
    }

    #[test]
    fn push_sets_current() {
        let mut h = AppHistory::new();
        h.push(img(10, 10));
        assert!(h.current().is_some());
        assert!(!h.can_undo());
        assert!(!h.can_redo());
    }

    #[test]
    fn undo_redo_navigate() {
        let mut h = AppHistory::new();
        h.push(img(10, 10));
        h.push(img(20, 20));
        h.push(img(30, 30));

        assert!(h.can_undo());
        assert!(!h.can_redo());
        assert_eq!(h.current().unwrap().width(), 30);

        h.undo();
        assert_eq!(h.current().unwrap().width(), 20);
        assert!(h.can_undo());
        assert!(h.can_redo());

        h.undo();
        assert_eq!(h.current().unwrap().width(), 10);
        assert!(!h.can_undo());
        assert!(h.can_redo());

        h.redo();
        assert_eq!(h.current().unwrap().width(), 20);
    }

    #[test]
    fn push_truncates_redo_stack() {
        let mut h = AppHistory::new();
        h.push(img(10, 10));
        h.push(img(20, 20));
        h.undo();
        h.push(img(50, 50)); // should discard img(20,20)
        assert!(!h.can_redo());
        assert_eq!(h.current().unwrap().width(), 50);
    }

    #[test]
    fn open_resets_history() {
        let mut h = AppHistory::new();
        h.push(img(10, 10));
        h.push(img(20, 20));
        h.open(img(99, 99));
        assert!(!h.can_undo());
        assert!(!h.can_redo());
        assert_eq!(h.current().unwrap().width(), 99);
    }
}
