use serde::Serialize;
use std::process::Command;
use std::net::{SocketAddr, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use sysinfo::{Components, Disks, Networks, ProcessRefreshKind, RefreshKind, System};
use tauri::ipc::Channel;

#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BatteryInfo {
    pub percent: u8,
    pub charging: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetInfo {
    pub name: String,
    pub rx: u64,
    pub tx: u64,
}

#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub mount: String,
    pub total: u64,
    pub used: u64,
}

/// Root plus real external volumes. The APFS service volumes (Preboot, VM,
/// Recovery, the Data twin of root) would show the same container 5 times.
pub fn keep_disk(mount: &str) -> bool {
    mount == "/" || (mount.starts_with("/Volumes/") && !mount.starts_with("/Volumes/com.apple"))
}

/// Dedupe by mount point, order preserved (sysinfo can list a mount twice).
pub fn dedupe_disks(disks: Vec<DiskInfo>) -> Vec<DiskInfo> {
    let mut seen = std::collections::HashSet::new();
    disks.into_iter().filter(|d| seen.insert(d.mount.clone())).collect()
}

fn disk_infos(disks: &Disks) -> Vec<DiskInfo> {
    dedupe_disks(
        disks
            .iter()
            .filter(|d| keep_disk(&d.mount_point().to_string_lossy()))
            .map(|d| DiskInfo {
                name: d.name().to_string_lossy().into_owned(),
                mount: d.mount_point().to_string_lossy().into_owned(),
                total: d.total_space(),
                used: d.total_space().saturating_sub(d.available_space()),
            })
            .collect(),
    )
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsPayload {
    pub cpus: Vec<f32>,
    pub load_avg: f32,
    pub mem_used: u64,
    pub mem_total: u64,
    pub procs: Vec<ProcInfo>,
    pub nets: Vec<NetInfo>,
    pub temp_c: Option<f32>,
    pub battery: Option<BatteryInfo>,
    pub uptime_secs: u64,
    pub lan_ip: Option<String>,
    pub ts_ip: Option<String>,
    pub wifi_ssid: Option<String>,
    pub swap_used: u64,
    pub swap_total: u64,
    pub cpu_freq_mhz: Option<u64>,
    pub ping_ms: Option<u32>,
    /// Every running process, not the truncated `procs` list.
    pub task_count: usize,
    /// Interface owning the LAN address. Stable, unlike ranking by 2s deltas.
    pub active_iface: Option<String>,
    pub disks: Vec<DiskInfo>,
}

/// Expensive probes (battery, ssid, ping) run on every fifth tick.
pub fn should_probe(tick: u32) -> bool {
    tick % 5 == 0
}

/// sysinfo reports 0 MHz when frequency is unavailable.
pub fn freq_or_none(mhz: u64) -> Option<u64> {
    (mhz > 0).then_some(mhz)
}

const PING_TARGET: &str = "1.1.1.1:443";
const PING_TIMEOUT: Duration = Duration::from_secs(1);
const PING_EVERY: Duration = Duration::from_secs(10);

/// Last probe result in milliseconds, or -1 for unreachable. Written by the
/// ping thread, read by the collector: a blocking connect must never sit in
/// the collector's critical path or a slow tick trips the staleness timer.
static PING_MS: AtomicI64 = AtomicI64::new(-1);

/// TCP connect time to a well-known host. None when unreachable.
fn probe_ping() -> Option<u32> {
    let addr: SocketAddr = PING_TARGET.parse().ok()?;
    let start = Instant::now();
    TcpStream::connect_timeout(&addr, PING_TIMEOUT).ok()?;
    Some(start.elapsed().as_millis().min(u32::MAX as u128) as u32)
}

fn spawn_ping_thread() {
    std::thread::spawn(|| loop {
        PING_MS.store(probe_ping().map(i64::from).unwrap_or(-1), Ordering::Relaxed);
        std::thread::sleep(PING_EVERY);
    });
}

/// Parse `pmset -g batt` output. None on desktops (no battery line).
pub fn parse_pmset(out: &str) -> Option<BatteryInfo> {
    let line = out.lines().find(|l| l.contains("InternalBattery"))?;
    let pct: u8 = line
        .split('\t')
        .nth(1)?
        .split('%')
        .next()?
        .trim()
        .parse()
        .ok()?;
    Some(BatteryInfo { percent: pct, charging: line.contains(" charging") })
}

fn battery() -> Option<BatteryInfo> {
    let out = Command::new("pmset").args(["-g", "batt"]).output().ok()?;
    parse_pmset(&String::from_utf8_lossy(&out.stdout))
}

fn cpu_temp(components: &Components) -> Option<f32> {
    // Best effort: hottest sensor whose label mentions the CPU. Apple Silicon
    // exposes these via IOHID on recent macOS; absence is expected, not an error.
    components
        .iter()
        .filter(|c| c.label().to_lowercase().contains("cpu"))
        .map(|c| c.temperature())
        .filter(|t| !t.is_nan())
        .fold(None, |acc, t| Some(acc.map_or(t, |a: f32| a.max(t))))
}

/// Remote IPv4s from `lsof -Fn` output: lines like "nLOCAL->REMOTE:PORT".
/// Private/loopback ranges dropped; deduped, order preserved.
pub fn parse_lsof(out: &str) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut ips = Vec::new();
    for line in out.lines() {
        let Some(rest) = line.strip_prefix('n') else { continue };
        let Some((_, remote)) = rest.split_once("->") else { continue };
        let Some((ip, _port)) = remote.rsplit_once(':') else { continue };
        let Ok(addr) = ip.parse::<std::net::Ipv4Addr>() else { continue };
        if addr.is_private() || addr.is_loopback() || addr.is_link_local() {
            continue;
        }
        if seen.insert(addr) {
            ips.push(addr.to_string());
        }
    }
    ips
}

/// Tailscale uses CGNAT space 100.64.0.0/10.
fn is_cgnat(ip: &std::net::Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 100 && (64..128).contains(&o[1])
}

/// (lan, tailscale): first RFC1918 address and first CGNAT address.
pub fn classify_ips(addrs: &[std::net::Ipv4Addr]) -> (Option<String>, Option<String>) {
    let mut lan = None;
    let mut ts = None;
    for ip in addrs {
        if ip.is_loopback() {
            continue;
        }
        if is_cgnat(ip) {
            ts.get_or_insert_with(|| ip.to_string());
        } else if ip.is_private() {
            lan.get_or_insert_with(|| ip.to_string());
        }
    }
    (lan, ts)
}

/// Parse `ipconfig getsummary en0` output. Line: "  SSID : <name>".
/// Must not match "BSSID : ...", so require the token before "SSID" boundary.
pub fn parse_ssid(out: &str) -> Option<String> {
    for line in out.lines() {
        let t = line.trim_start();
        if let Some(rest) = t.strip_prefix("SSID : ") {
            let v = rest.trim();
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }
    None
}

fn wifi_ssid() -> Option<String> {
    let out = Command::new("ipconfig").args(["getsummary", "en0"]).output().ok()?;
    parse_ssid(&String::from_utf8_lossy(&out.stdout))
}

/// en0 first, then the rest in their given order. Pure over `(name, addrs)`
/// pairs so it's testable without a live `Networks` instance. `classify_ips`
/// then naturally picks en0's RFC1918 address when present, instead of
/// whatever HashMap iteration order happened to surface first.
pub fn order_ifaces(pairs: Vec<(String, Vec<std::net::Ipv4Addr>)>) -> Vec<std::net::Ipv4Addr> {
    let mut en0 = Vec::new();
    let mut rest = Vec::new();
    for (name, addrs) in pairs {
        if name == "en0" {
            en0.extend(addrs);
        } else {
            rest.extend(addrs);
        }
    }
    en0.extend(rest);
    en0
}

/// Name of the interface holding `ip`. Ranking interfaces by their 2s traffic
/// delta instead makes the label flip between en0, utun*, and awdl0 each tick.
pub fn iface_for_ip(
    pairs: &[(String, Vec<std::net::Ipv4Addr>)],
    ip: Option<&str>,
) -> Option<String> {
    let want: std::net::Ipv4Addr = ip?.parse().ok()?;
    pairs
        .iter()
        .find(|(_, addrs)| addrs.contains(&want))
        .map(|(name, _)| name.clone())
}

fn iface_pairs(networks: &Networks) -> Vec<(String, Vec<std::net::Ipv4Addr>)> {
    networks
        .iter()
        .map(|(name, data)| {
            let v4s = data
                .ip_networks()
                .iter()
                .filter_map(|n| match n.addr {
                    std::net::IpAddr::V4(v4) => Some(v4),
                    _ => None,
                })
                .collect();
            (name.clone(), v4s)
        })
        .collect()
}

fn local_ipv4s(networks: &Networks) -> Vec<std::net::Ipv4Addr> {
    let pairs = networks
        .iter()
        .map(|(name, data)| {
            let v4s = data
                .ip_networks()
                .iter()
                .filter_map(|n| match n.addr {
                    std::net::IpAddr::V4(v4) => Some(v4),
                    _ => None,
                })
                .collect();
            (name.clone(), v4s)
        })
        .collect();
    order_ifaces(pairs)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

#[tauri::command]
pub fn fs_list(path: String) -> Result<Vec<FsEntry>, String> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(|e| e.to_string())? {
        let Ok(entry) = entry else { continue };
        let Ok(meta) = entry.metadata() else { continue };
        out.push(FsEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            size: meta.len(),
        });
    }
    Ok(out)
}

/// Last `max` lines of a file, reading only the trailing 64KB.
#[tauri::command]
pub fn log_tail(path: String, max: usize) -> Result<Vec<String>, String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let len = f.metadata().map_err(|e| e.to_string())?.len();
    let start = len.saturating_sub(64 * 1024);
    f.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&buf);
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    if start > 0 && !lines.is_empty() {
        lines.remove(0); // partial line from seeking mid-file
    }
    let n = lines.len();
    Ok(lines.split_off(n.saturating_sub(max)))
}

/// Today's usage JSON from the local tokscale CLI. GUI apps don't inherit
/// the shell PATH, so fall back to the standard install location.
#[tauri::command]
pub fn tok_usage() -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = ["tokscale".to_string(), format!("{home}/.local/bin/tokscale")];
    for bin in &candidates {
        if let Ok(out) = Command::new(bin).args(["hourly", "--today", "--json"]).output() {
            if out.status.success() {
                return Ok(String::from_utf8_lossy(&out.stdout).into_owned());
            }
        }
    }
    Err("tokscale not found".into())
}

#[tauri::command]
pub fn net_connections() -> Vec<String> {
    Command::new("lsof")
        .args(["-i", "TCP", "-s", "TCP:ESTABLISHED", "-n", "-P", "-Fn"])
        .output()
        .map(|o| parse_lsof(&String::from_utf8_lossy(&o.stdout)))
        .unwrap_or_default()
}

static RUNNING: AtomicBool = AtomicBool::new(false);
/// Every window's channel. One collector fans each tick out to all of them;
/// a closed channel (window gone, dev reload) is dropped on its first failed
/// send.
static SUBSCRIBERS: Mutex<Vec<Channel<StatsPayload>>> = Mutex::new(Vec::new());

#[tauri::command]
pub fn stats_stream(channel: Channel<StatsPayload>) {
    SUBSCRIBERS.lock().unwrap().push(channel);
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    spawn_ping_thread();
    std::thread::spawn(move || {
        let mut sys = System::new_with_specifics(RefreshKind::everything());
        let mut networks = Networks::new_with_refreshed_list();
        // sysinfo 0.31.4 only refreshes interface addresses in
        // refresh_list(), never in refresh(); a dedicated instance keeps
        // that (infrequent) refresh separate from the rx/tx delta tracking
        // `networks` does every tick.
        let mut addrs = Networks::new_with_refreshed_list();
        let mut components = Components::new_with_refreshed_list();
        let mut disks = Disks::new_with_refreshed_list();
        let mut tick: u32 = 0;
        let mut last_battery: Option<BatteryInfo> = battery();
        let mut last_ssid: Option<String> = wifi_ssid();
        loop {
            std::thread::sleep(Duration::from_secs(2));
            if should_probe(tick) {
                last_battery = battery();
                last_ssid = wifi_ssid();
                addrs.refresh_list();
                sys.refresh_cpu_frequency();
                // refresh_list also catches newly mounted external volumes
                disks.refresh_list();
            }
            tick = tick.wrapping_add(1);
            sys.refresh_cpu_usage();
            sys.refresh_memory();
            sys.refresh_processes_specifics(
                sysinfo::ProcessesToUpdate::All,
                ProcessRefreshKind::new().with_cpu(),
            );
            networks.refresh();
            components.refresh();

            let mut procs: Vec<ProcInfo> = sys
                .processes()
                .values()
                .map(|p| ProcInfo {
                    pid: p.pid().as_u32(),
                    name: p.name().to_string_lossy().into_owned(),
                    cpu: p.cpu_usage(),
                })
                .collect();
            let task_count = procs.len();
            procs.sort_by(|a, b| b.cpu.total_cmp(&a.cpu));
            procs.truncate(8);

            let pairs = iface_pairs(&addrs);
            let (lan_ip, ts_ip) = classify_ips(&order_ifaces(pairs.clone()));
            let active_iface = iface_for_ip(&pairs, lan_ip.as_deref());

            let payload = StatsPayload {
                cpus: sys.cpus().iter().map(|c| c.cpu_usage()).collect(),
                load_avg: System::load_average().one as f32,
                mem_used: sys.used_memory(),
                mem_total: sys.total_memory(),
                procs,
                nets: networks
                    .iter()
                    .filter(|(_, d)| d.received() > 0 || d.transmitted() > 0)
                    .map(|(name, d)| NetInfo {
                        name: name.clone(),
                        rx: d.received(),
                        tx: d.transmitted(),
                    })
                    .collect(),
                temp_c: cpu_temp(&components),
                battery: last_battery.clone(),
                uptime_secs: System::uptime(),
                lan_ip,
                ts_ip,
                wifi_ssid: last_ssid.clone(),
                swap_used: sys.used_swap(),
                swap_total: sys.total_swap(),
                cpu_freq_mhz: sys.cpus().first().and_then(|c| freq_or_none(c.frequency())),
                ping_ms: PING_MS.load(Ordering::Relaxed).try_into().ok(),
                task_count,
                active_iface,
                disks: disk_infos(&disks),
            };
            let mut subs = SUBSCRIBERS.lock().unwrap();
            subs.retain(|c| c.send(payload.clone()).is_ok());
            if subs.is_empty() {
                RUNNING.store(false, Ordering::SeqCst);
                break;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iface_for_ip_matches_the_owner() {
        let pairs = vec![
            ("lo0".to_string(), vec!["127.0.0.1".parse().unwrap()]),
            ("en0".to_string(), vec!["192.168.1.5".parse().unwrap()]),
        ];
        assert_eq!(iface_for_ip(&pairs, Some("192.168.1.5")).as_deref(), Some("en0"));
        assert_eq!(iface_for_ip(&pairs, Some("10.0.0.1")), None);
        assert_eq!(iface_for_ip(&pairs, None), None);
        assert_eq!(iface_for_ip(&pairs, Some("garbage")), None);
    }

    #[test]
    fn ping_cadence_every_fifth_tick() {
        assert!(should_probe(0));
        assert!(!should_probe(1));
        assert!(!should_probe(4));
        assert!(should_probe(5));
        assert!(should_probe(10));
    }

    #[test]
    fn zero_freq_is_unavailable() {
        assert_eq!(freq_or_none(0), None);
        assert_eq!(freq_or_none(3200), Some(3200));
    }

    #[test]
    fn parses_pmset_discharging() {
        let out = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=123)\t87%; discharging; 4:32 remaining present: true\n";
        assert_eq!(parse_pmset(out), Some(BatteryInfo { percent: 87, charging: false }));
    }

    #[test]
    fn parses_pmset_charging() {
        let out = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=123)\t42%; charging; 1:10 remaining present: true\n";
        assert_eq!(parse_pmset(out), Some(BatteryInfo { percent: 42, charging: true }));
    }

    #[test]
    fn desktop_has_no_battery() {
        assert_eq!(parse_pmset("Now drawing from 'AC Power'\n"), None);
    }

    #[test]
    fn parses_lsof_remotes_dedup_public_only() {
        let out = "p123\nnlocalhost:52000->93.184.216.34:443\nn192.168.1.5:6000->192.168.1.202:3000\nn10.0.0.2:1->10.0.0.3:2\nnlocalhost:52001->93.184.216.34:443\n";
        assert_eq!(parse_lsof(out), vec!["93.184.216.34".to_string()]);
    }

    #[test]
    fn classifies_lan_and_tailscale() {
        let addrs = vec![
            "127.0.0.1".parse().unwrap(),
            "100.101.102.103".parse().unwrap(),
            "192.168.1.23".parse().unwrap(),
        ];
        let (lan, ts) = classify_ips(&addrs);
        assert_eq!(lan.as_deref(), Some("192.168.1.23"));
        assert_eq!(ts.as_deref(), Some("100.101.102.103"));
    }

    #[test]
    fn cgnat_is_not_lan() {
        let addrs = vec!["100.64.0.1".parse().unwrap()];
        let (lan, ts) = classify_ips(&addrs);
        assert_eq!(lan, None);
        assert_eq!(ts.as_deref(), Some("100.64.0.1"));
    }

    #[test]
    fn en0_preferred_over_earlier_listed_bridge() {
        let pairs = vec![
            ("bridge0".to_string(), vec!["192.168.2.1".parse().unwrap()]),
            ("en0".to_string(), vec!["192.168.1.23".parse().unwrap()]),
        ];
        let ordered = order_ifaces(pairs);
        assert_eq!(ordered[0], "192.168.1.23".parse::<std::net::Ipv4Addr>().unwrap());
    }

    #[test]
    fn root_and_external_volumes_only() {
        assert!(keep_disk("/"));
        assert!(keep_disk("/Volumes/Backup"));
        assert!(!keep_disk("/System/Volumes/Data"));
        assert!(!keep_disk("/System/Volumes/VM"));
        assert!(!keep_disk("/Volumes/com.apple.TimeMachine.localsnapshots"));
    }

    #[test]
    fn duplicate_mounts_collapse() {
        let d = |mount: &str| DiskInfo {
            name: "x".into(),
            mount: mount.into(),
            total: 10,
            used: 5,
        };
        let out = dedupe_disks(vec![d("/"), d("/Volumes/A"), d("/")]);
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn parses_ssid_from_ipconfig_summary() {
        let out = "  BSSID : aa:bb:cc\n  SSID : MyHomeNet 5G\n  Security: WPA2\n";
        assert_eq!(parse_ssid(out).as_deref(), Some("MyHomeNet 5G"));
        assert_eq!(parse_ssid("no wifi here\n"), None);
    }
}
