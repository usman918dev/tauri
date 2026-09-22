use std::fs;
use std::path::PathBuf;
use tauri::Manager;

fn sanitize_storage_key(key: &str) -> String {
    key.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

fn get_storage_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let storage_dir = app_dir.join("storage");
    if !storage_dir.exists() {
        fs::create_dir_all(&storage_dir).map_err(|e| e.to_string())?;
    }
    Ok(storage_dir)
}

#[tauri::command]
fn save_app_data(app_handle: tauri::AppHandle, key: String, data: String) -> Result<(), String> {
    let dir = get_storage_dir(&app_handle)?;
    let safe_key = sanitize_storage_key(&key);
    let file_path = dir.join(format!("{}.json", safe_key));
    let tmp_path = dir.join(format!("{}.tmp", safe_key));

    fs::write(&tmp_path, data.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &file_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_app_data(app_handle: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let dir = get_storage_dir(&app_handle)?;
    let safe_key = sanitize_storage_key(&key);
    let file_path = dir.join(format!("{}.json", safe_key));
    if !file_path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    Ok(Some(content))
}

#[tauri::command]
fn remove_app_data(app_handle: tauri::AppHandle, key: String) -> Result<(), String> {
    let dir = get_storage_dir(&app_handle)?;
    let safe_key = sanitize_storage_key(&key);
    let file_path = dir.join(format!("{}.json", safe_key));
    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn pick_open_file() -> Result<Option<String>, String> {
    let file = rfd::FileDialog::new()
        .add_filter("PowerPoint Presentation", &["pptx"])
        .pick_file();
    Ok(file.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn pick_save_file(suggested_name: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new()
        .add_filter("PowerPoint Presentation", &["pptx"]);
    if let Some(name) = &suggested_name {
        dialog = dialog.set_file_name(name);
    }
    let file = dialog.save_file();
    Ok(file.map(|p| p.to_string_lossy().to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      read_binary_file,
      write_binary_file,
      pick_open_file,
      pick_save_file,
      save_app_data,
      load_app_data,
      remove_app_data
    ])
    .setup(|app| {
      #[cfg(desktop)]
      {
        app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
        app.handle().plugin(tauri_plugin_process::init())?;
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

