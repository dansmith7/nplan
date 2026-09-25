mod commands;
mod menu;
mod tray;

use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub fn run() {
    let mut builder = tauri::Builder::default();

    // Register plugins
    builder = builder
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        handle_global_shortcut(app, shortcut);
                    }
                })
                .build(),
        );

    builder
        .setup(|app| {
            // Set up system tray
            tray::create_tray(app)?;

            // Set up menu
            menu::create_menu(app)?;

            // Register global shortcuts
            register_global_shortcuts(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::show_notification,
            commands::get_auto_launch,
            commands::set_auto_launch,
            commands::get_settings,
            commands::set_settings,
            commands::is_desktop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn register_global_shortcuts(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut_toggle = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyO);
    app.global_shortcut().register(shortcut_toggle)?;

    Ok(())
}

fn handle_global_shortcut(app: &tauri::AppHandle, shortcut: &Shortcut) {
    let toggle_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyO);
    if shortcut == &toggle_shortcut {
        // Toggle window visibility
        if let Some(window) = app.get_webview_window("main") {
            if window.is_visible().unwrap_or(false) {
                let _ = window.hide();
            } else {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}
