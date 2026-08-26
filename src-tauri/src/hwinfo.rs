// One-shot hardware identity for the hwinfo widget. Pure parsing lives in
// chassis_for and parse_hardware_profile so it can be tested without a Mac.
use std::process::Command;

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HwInfo {
    pub manufacturer: String,
    pub model: String,
    pub chassis: String,
}

/// Model-identifier prefix to chassis label. Matching is first-hit, so the
/// table MUST stay ordered longest-prefix-first: `Mac` above `MacBook` would
/// swallow every model. Mac Studio reports Mac13,1/Mac14,13, never
/// "MacStudio", so it lands on the generic DESKTOP row by design.
pub fn chassis_for(model: &str) -> &'static str {
    const TABLE: &[(&str, &str)] = &[
        ("MacBookPro", "LAPTOP"),
        ("MacBookAir", "LAPTOP"),
        ("MacBook", "LAPTOP"),
        ("Macmini", "DESKTOP MINI"),
        ("MacPro", "TOWER"),
        ("iMac", "ALL-IN-ONE"),
        ("Mac", "DESKTOP"),
    ];
    TABLE
        .iter()
        .find(|(prefix, _)| model.starts_with(prefix))
        .map(|(_, label)| *label)
        .unwrap_or("UNKNOWN")
}

/// Pull "Model Identifier" out of `system_profiler SPHardwareDataType`.
pub fn parse_hardware_profile(out: &str) -> Option<String> {
    let line = out.lines().find(|l| l.contains("Model Identifier:"))?;
    let value = line.split_once(':')?.1.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn sysctl_model() -> Option<String> {
    let out = Command::new("sysctl").args(["-n", "hw.model"]).output().ok()?;
    let value = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn profiler_model() -> Option<String> {
    let out = Command::new("system_profiler")
        .arg("SPHardwareDataType")
        .output()
        .ok()?;
    parse_hardware_profile(&String::from_utf8_lossy(&out.stdout))
}

// async: the system_profiler fallback can take seconds and must not block
// the main thread while the cockpit builds.
#[tauri::command(async)]
pub fn hw_info() -> HwInfo {
    let model = sysctl_model()
        .or_else(profiler_model)
        .unwrap_or_else(|| "UNKNOWN".to_string());
    HwInfo {
        manufacturer: "APPLE".to_string(),
        chassis: chassis_for(&model).to_string(),
        model,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chassis_by_prefix() {
        assert_eq!(chassis_for("MacBookPro18,3"), "LAPTOP");
        assert_eq!(chassis_for("MacBookAir10,1"), "LAPTOP");
        assert_eq!(chassis_for("Macmini9,1"), "DESKTOP MINI");
        assert_eq!(chassis_for("iMac21,1"), "ALL-IN-ONE");
        assert_eq!(chassis_for("MacPro7,1"), "TOWER");
        assert_eq!(chassis_for("Mac14,12"), "DESKTOP");
        assert_eq!(chassis_for("Mac13,1"), "DESKTOP"); // Mac Studio
        assert_eq!(chassis_for("MacBook10,1"), "LAPTOP"); // not swallowed by Mac
        assert_eq!(chassis_for(""), "UNKNOWN");
        assert_eq!(chassis_for("Linux"), "UNKNOWN");
    }

    #[test]
    fn hardware_profile_model_identifier() {
        let out = "Hardware:\n\n    Hardware Overview:\n\n      Model Name: Mac mini\n      Model Identifier: Macmini9,1\n      Chip: Apple M1\n";
        assert_eq!(parse_hardware_profile(out).as_deref(), Some("Macmini9,1"));
        assert_eq!(parse_hardware_profile("garbage"), None);
        assert_eq!(parse_hardware_profile("      Model Identifier:   \n"), None);
    }
}
