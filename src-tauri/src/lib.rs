mod hwinfo;
mod stats;

use base64::Engine;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State};

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    child_pid: Option<u32>,
    /// Shared with the reader thread: Some(file) = raw output logging on.
    log: Arc<Mutex<Option<std::fs::File>>>,
}

#[derive(Default)]
struct PtyState(Mutex<HashMap<u32, Session>>);

#[derive(Clone, Serialize)]
#[serde(tag = "type")]
enum PtyEvent {
    #[serde(rename = "data")]
    Data { b64: String },
    #[serde(rename = "exit")]
    Exit,
}

#[derive(Serialize)]
#[serde(tag = "kind")]
enum PasteResult {
    #[serde(rename = "path")]
    Path { path: String },
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "empty")]
    Empty,
}

fn kill_session(mut s: Session) {
    drop(s.writer);
    let _ = s.killer.kill();
}

/// Drops the zsh integration files into app data and returns the directory,
/// so zsh can be started with ZDOTDIR pointing at it. Embedded rather than
/// bundled: nothing to configure in tauri.conf, and the files are rewritten
/// on every spawn so an upgrade never runs stale hooks.
fn zsh_integration_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("shell")
        .join("zsh");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for (name, body) in [
        (".zshenv", include_str!("../shell/zsh/.zshenv")),
        (".zprofile", include_str!("../shell/zsh/.zprofile")),
        (".zshrc", include_str!("../shell/zsh/.zshrc")),
    ] {
        std::fs::write(dir.join(name), body).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

#[tauri::command]
fn pty_spawn(
    app: AppHandle,
    state: State<PtyState>,
    channel: Channel<PtyEvent>,
    id: u32,
    cwd: Option<String>,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    if let Some(old) = guard.remove(&id) {
        kill_session(old);
    }

    let pty = native_pty_system()
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l");
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "phosphor");
    if shell.ends_with("zsh") {
        if let Ok(dir) = zsh_integration_dir(&app) {
            if let Ok(orig) = std::env::var("ZDOTDIR") {
                cmd.env("PHOSPHOR_ORIG_ZDOTDIR", orig);
            }
            cmd.env("ZDOTDIR", dir);
        }
    }
    let dir = cwd
        .filter(|c| std::path::Path::new(c).is_dir())
        .or_else(|| std::env::var("HOME").ok());
    if let Some(dir) = dir {
        cmd.cwd(dir);
    }

    let child = pty.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let child_pid = child.process_id();
    let killer = child.clone_killer();
    let mut reader = pty.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pty.master.take_writer().map_err(|e| e.to_string())?;

    let log: Arc<Mutex<Option<std::fs::File>>> = Arc::new(Mutex::new(None));
    let log_reader = Arc::clone(&log);
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if let Some(f) = log_reader.lock().unwrap().as_mut() {
                        let _ = f.write_all(&buf[..n]);
                    }
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                    if channel.send(PtyEvent::Data { b64 }).is_err() {
                        break;
                    }
                }
            }
        }
        let _ = channel.send(PtyEvent::Exit);
    });

    guard.insert(
        id,
        Session {
            master: pty.master,
            writer,
            killer,
            child_pid,
            log,
        },
    );
    Ok(())
}

/// Start logging a pane's raw output (ANSI included) to app-data/logs.
/// Returns the file path.
#[tauri::command]
fn pty_log_start(app: AppHandle, state: State<PtyState>, id: u32) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("logs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("pane{}-{}.log", id, now_stamp()));
    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let guard = state.0.lock().unwrap();
    let s = guard.get(&id).ok_or("no pty")?;
    *s.log.lock().unwrap() = Some(file);
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn pty_log_stop(state: State<PtyState>, id: u32) {
    let guard = state.0.lock().unwrap();
    if let Some(s) = guard.get(&id) {
        *s.log.lock().unwrap() = None;
    }
}

#[tauri::command]
fn pty_write(state: State<PtyState>, id: u32, data: String) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    match guard.get_mut(&id) {
        Some(s) => s
            .writer
            .write_all(data.as_bytes())
            .and_then(|_| s.writer.flush())
            .map_err(|e| e.to_string()),
        None => Err("no pty".into()),
    }
}

#[tauri::command]
fn pty_resize(state: State<PtyState>, id: u32, rows: u16, cols: u16) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    match guard.get(&id) {
        Some(s) => s
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string()),
        None => Err("no pty".into()),
    }
}

#[tauri::command]
fn pty_kill(state: State<PtyState>, id: u32) {
    let mut guard = state.0.lock().unwrap();
    if let Some(s) = guard.remove(&id) {
        kill_session(s);
    }
}

#[tauri::command]
fn pty_cwd(state: State<PtyState>, id: u32) -> Result<String, String> {
    let pid = {
        let guard = state.0.lock().unwrap();
        guard
            .get(&id)
            .and_then(|s| s.child_pid)
            .ok_or("no pty or pid")?
    };

    #[cfg(target_os = "linux")]
    {
        return std::fs::read_link(format!("/proc/{}/cwd", pid))
            .map(|p| p.to_string_lossy().into_owned())
            .map_err(|e| e.to_string());
    }

    #[cfg(not(target_os = "linux"))]
    {
        let out = Command::new("lsof")
            .args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
            .output()
            .map_err(|e| e.to_string())?;
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .find_map(|l| l.strip_prefix('n').map(str::to_string))
            .ok_or_else(|| "cwd not found".into())
    }
}

fn workspace_file_name(name: Option<&str>) -> String {
    match name {
        Some(n) if !n.is_empty() && n.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') => {
            format!("workspace-{n}.json")
        }
        _ => "workspace.json".to_string(),
    }
}

fn workspace_path(app: &AppHandle, name: Option<String>) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(workspace_file_name(name.as_deref())))
}

fn snippets_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("snippets.json"))
}

#[tauri::command]
fn workspace_load(app: AppHandle, name: Option<String>) -> Result<String, String> {
    let path = workspace_path(&app, name)?;
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn workspace_save(app: AppHandle, json: String, name: Option<String>) -> Result<(), String> {
    std::fs::write(workspace_path(&app, name)?, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn workspace_quarantine(app: AppHandle, name: Option<String>) -> Result<(), String> {
    let path = workspace_path(&app, name)?;
    if path.exists() {
        let bad = path.with_file_name(format!("{}.bad-{}", path.file_name().unwrap().to_string_lossy(), now_stamp()));
        std::fs::rename(&path, bad).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn snippets_load(app: AppHandle) -> Result<String, String> {
    let path = snippets_path(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn snippets_save(app: AppHandle, json: String) -> Result<(), String> {
    let path = snippets_path(&app)?;
    let tmp_path = path.with_file_name("snippets.json.tmp");
    std::fs::write(&tmp_path, &json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
    // Multiple windows share this one file; tell every other window to pick
    // up the change instead of overwriting it at their next save.
    let _ = app.emit("snippets-changed", json);
    Ok(())
}

#[tauri::command]
fn snippets_quarantine(app: AppHandle) -> Result<(), String> {
    let path = snippets_path(&app)?;
    if path.exists() {
        let bad = path.with_file_name(format!("{}.bad-{}", path.file_name().unwrap().to_string_lossy(), now_stamp()));
        std::fs::rename(&path, bad).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn inbox_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("inbox");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn now_stamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// A file copied in Finder lands on the pasteboard as a furl; arboard can't see
// it, so ask osascript. Errors (no furl, or not macOS) just mean "not a file".
fn clipboard_file_path() -> Option<String> {
    // `the clipboard as «class furl»` coerces ANY text into a file URL
    // ("hello" -> "/hello"), so check that a furl flavour is actually on the
    // pasteboard before asking for the path.
    let out = Command::new("osascript")
        .args([
            "-e",
            "if (clipboard info for «class furl») is {} then error \"no file\"",
            "-e",
            "POSIX path of (the clipboard as «class furl»)",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

#[tauri::command]
fn smart_paste(app: AppHandle) -> Result<PasteResult, String> {
    if let Some(path) = clipboard_file_path() {
        return Ok(PasteResult::Path { path });
    }

    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;

    if let Ok(img) = cb.get_image() {
        let path = inbox_dir(&app)?.join(format!("paste-{}.png", now_stamp()));
        let buf: image::RgbaImage = image::ImageBuffer::from_raw(
            img.width as u32,
            img.height as u32,
            img.bytes.into_owned(),
        )
        .ok_or("bad clipboard image data")?;
        buf.save(&path).map_err(|e| e.to_string())?;
        return Ok(PasteResult::Path {
            path: path.to_string_lossy().into_owned(),
        });
    }

    match cb.get_text() {
        Ok(text) if !text.is_empty() => Ok(PasteResult::Text { text }),
        _ => Ok(PasteResult::Empty),
    }
}

/// Deepest descendant of `root` in a (pid, ppid, comm) snapshot. Ties break
/// toward the highest pid (the newest process, most likely the foreground).
fn deepest_descendant(procs: &[(u32, u32, String)], root: u32) -> Option<String> {
    use std::collections::HashMap as Map;
    let mut children: Map<u32, Vec<u32>> = Map::new();
    let mut comm: Map<u32, &str> = Map::new();
    for (pid, ppid, c) in procs {
        children.entry(*ppid).or_default().push(*pid);
        comm.insert(*pid, c);
    }
    comm.get(&root)?;
    let mut best = (0usize, root);
    let mut stack = vec![(0usize, root)];
    while let Some((depth, pid)) = stack.pop() {
        if depth > best.0 || (depth == best.0 && pid > best.1) {
            best = (depth, pid);
        }
        if let Some(kids) = children.get(&pid) {
            for k in kids {
                stack.push((depth + 1, *k));
            }
        }
    }
    comm.get(&best.1).map(|c| {
        c.rsplit('/').next().unwrap_or(c).to_string()
    })
}

fn ps_snapshot() -> Vec<(u32, u32, String)> {
    let out = match Command::new("ps").args(["-ax", "-o", "pid=,ppid=,comm="]).output() {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|l| {
            let mut it = l.split_whitespace();
            let pid = it.next()?.parse().ok()?;
            let ppid = it.next()?.parse().ok()?;
            let comm = it.collect::<Vec<_>>().join(" ");
            Some((pid, ppid, comm))
        })
        .collect()
}

/// Foreground-most process per pane pty id. One ps call for the whole batch;
/// runs on the TS 2s tick, so keep it cheap and never fail the call.
#[tauri::command]
fn pty_foreground(state: State<PtyState>, ids: Vec<u32>) -> HashMap<u32, String> {
    let roots: Vec<(u32, u32)> = {
        let guard = state.0.lock().unwrap();
        ids.iter()
            .filter_map(|id| guard.get(id).and_then(|s| s.child_pid).map(|pid| (*id, pid)))
            .collect()
    };
    if roots.is_empty() {
        return HashMap::new();
    }
    let snap = ps_snapshot();
    roots
        .into_iter()
        .filter_map(|(id, pid)| deepest_descendant(&snap, pid).map(|c| (id, c)))
        .collect()
}

// WKWebView rejects navigator.clipboard.writeText (read works, write doesn't),
// so copy routes through arboard like paste already does.
#[tauri::command]
fn clipboard_write_text(text: String) -> Result<(), String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_inbox_file(app: AppHandle, name: String, bytes: Vec<u8>) -> Result<String, String> {
    let safe: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let path = inbox_dir(&app)?.join(format!("{}-{}", now_stamp(), safe));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
struct TrayItem {
    id: String,
    label: String,
}

#[derive(Default)]
struct TrayState(Mutex<HashMap<String, Vec<TrayItem>>>); // window label -> items

fn rebuild_tray(app: &AppHandle, state: &TrayState) {
    let guard = state.0.lock().unwrap();
    let total: usize = guard.values().map(|v| v.len()).sum();
    let reporting = guard.values().filter(|v| !v.is_empty()).count();
    let Ok(menu) = Menu::new(app) else { return };
    let mut wins: Vec<&String> = guard.keys().collect();
    wins.sort();
    for win in wins {
        let items = &guard[win];
        if items.is_empty() {
            continue;
        }
        if reporting > 1 {
            if let Ok(hdr) = MenuItem::with_id(app, format!("hdr::{win}"), win, false, None::<&str>) {
                let _ = menu.append(&hdr);
            }
        }
        for it in items {
            // Menu item id carries the routing: "<window label>::<pane id>".
            if let Ok(mi) = MenuItem::with_id(app, format!("{win}::{}", it.id), &it.label, true, None::<&str>) {
                let _ = menu.append(&mi);
            }
        }
    }
    if total == 0 {
        if let Ok(mi) = MenuItem::with_id(app, "none", "No pane needs attention", false, None::<&str>) {
            let _ = menu.append(&mi);
        }
    }
    if let Some(tray) = app.tray_by_id("phosphor-tray") {
        let _ = tray.set_menu(Some(menu));
        let _ = tray.set_title(if total > 0 { Some(format!("◉ {total}")) } else { None::<String> });
    }
}

#[tauri::command]
fn tray_update(app: AppHandle, state: State<TrayState>, win: String, items: Vec<TrayItem>) {
    state.0.lock().unwrap().insert(win, items);
    rebuild_tray(&app, &state);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(PtyState::default())
        .manage(TrayState::default())
        .setup(|app| {
            let _ = TrayIconBuilder::with_id("phosphor-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .on_menu_event(|app, event| {
                    let id = event.id().0.clone();
                    if let Some((win, pane)) = id.split_once("::") {
                        if let Some(w) = app.get_webview_window(win) {
                            let _ = w.set_focus();
                            let _ = w.emit("tray-jump", serde_json::json!({ "id": pane }));
                        }
                    }
                })
                .build(app);
            Ok(())
        })
        // Tauri's default menu carries File > Close Window on Cmd+W, which
        // fires alongside the app's own Cmd+W (close pane); a keydown
        // preventDefault cannot stop a native accelerator. Build the menu
        // without it: the OS window buttons and Cmd+Q still work.
        .menu(|app| {
            use tauri::menu::{MenuBuilder, PredefinedMenuItem, SubmenuBuilder};
            let app_menu = SubmenuBuilder::new(app, "phosphor")
                .about(None)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;
            let edit = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let window = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .item(&PredefinedMenuItem::fullscreen(app, None)?)
                .build()?;
            // Registering this as the NSApp windows menu is what makes macOS
            // append the standard items (tiling, Bring All to Front, the open
            // window list) and honor the Fn+Ctrl+arrow move shortcuts.
            #[cfg(target_os = "macos")]
            let _ = window.set_as_windows_menu_for_nsapp();
            MenuBuilder::new(app).items(&[&app_menu, &edit, &window]).build()
        })
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            pty_cwd,
            pty_log_start,
            pty_log_stop,
            pty_foreground,
            workspace_load,
            workspace_save,
            workspace_quarantine,
            snippets_load,
            snippets_save,
            snippets_quarantine,
            smart_paste,
            clipboard_write_text,
            save_inbox_file,
            tray_update,
            stats::stats_stream,
            stats::net_connections,
            stats::fs_list,
            stats::log_tail,
            stats::tok_usage,
            hwinfo::hw_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn deepest_descendant_walks_the_tree() {
        // (pid, ppid, comm)
        let procs = vec![
            (100, 1, "zsh".to_string()),
            (200, 100, "node".to_string()),
            (300, 200, "claude".to_string()),
            (400, 1, "other".to_string()),
        ];
        assert_eq!(super::deepest_descendant(&procs, 100), Some("claude".to_string()));
        // A childless shell returns itself.
        assert_eq!(super::deepest_descendant(&procs, 400), Some("other".to_string()));
        // Unknown root: nothing.
        assert_eq!(super::deepest_descendant(&procs, 999), None);
    }

    #[test]
    fn workspace_file_name_is_per_window_and_safe() {
        assert_eq!(super::workspace_file_name(None), "workspace.json");
        assert_eq!(super::workspace_file_name(Some("")), "workspace.json");
        assert_eq!(super::workspace_file_name(Some("w2")), "workspace-w2.json");
        assert_eq!(super::workspace_file_name(Some("w-night")), "workspace-w-night.json");
        assert_eq!(super::workspace_file_name(Some("../x")), "workspace.json");
    }

    /// Cargo runs tests concurrently and two of them touch the one real
    /// pasteboard; they serialize on this or interleave and flake.
    #[cfg(target_os = "macos")]
    static PASTEBOARD: std::sync::Mutex<()> = std::sync::Mutex::new(());

    /// macOS coerces plain text into a file URL ("hello" -> "/hello"); the
    /// furl guard must refuse a text-only clipboard. Touches the real
    /// pasteboard, so it restores what it found.
    #[test]
    #[cfg(target_os = "macos")]
    fn text_clipboard_is_not_a_file_path() {
        use std::io::Write;
        use std::process::{Command, Stdio};
        let _guard = PASTEBOARD.lock().unwrap();
        let saved = Command::new("pbpaste").output().ok().map(|o| o.stdout);
        let mut p = Command::new("pbcopy").stdin(Stdio::piped()).spawn().unwrap();
        p.stdin.take().unwrap().write_all(b"echo PASTE-ONCE").unwrap();
        p.wait().unwrap();
        let got = super::clipboard_file_path();
        if let Some(bytes) = saved {
            if let Ok(mut p) = Command::new("pbcopy").stdin(Stdio::piped()).spawn() {
                let _ = p.stdin.take().unwrap().write_all(&bytes);
                let _ = p.wait();
            }
        }
        assert_eq!(got, None);
    }

    /// Copy must land on the real pasteboard (the whole point of routing it
    /// through arboard). Touches the real pasteboard, so it restores what it
    /// found.
    #[test]
    #[cfg(target_os = "macos")]
    fn clipboard_write_text_round_trips() {
        use std::io::Write;
        use std::process::{Command, Stdio};
        let _guard = PASTEBOARD.lock().unwrap();
        let saved = Command::new("pbpaste").output().ok().map(|o| o.stdout);
        super::clipboard_write_text("COPY-ONCE".into()).unwrap();
        let got = Command::new("pbpaste").output().unwrap().stdout;
        if let Some(bytes) = saved {
            if let Ok(mut p) = Command::new("pbcopy").stdin(Stdio::piped()).spawn() {
                let _ = p.stdin.take().unwrap().write_all(&bytes);
                let _ = p.wait();
            }
        }
        assert_eq!(String::from_utf8_lossy(&got), "COPY-ONCE");
    }
}
