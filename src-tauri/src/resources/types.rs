use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProcessKind {
    App,
    Sidecar,
    Agent,
    DevServer,
    Shell,
    Other,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub name: String,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub start_time: u64,
    pub workspace_id: Option<String>,
    pub kind: ProcessKind,
    pub killable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInfo {
    pub port: u16,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub workspace_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSnapshot {
    pub total_cpu_percent: f32,
    pub total_memory_bytes: u64,
    pub processes: Vec<ProcessInfo>,
    pub ports: Vec<PortInfo>,
    pub ports_unavailable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStorage {
    pub id: String,
    pub name: String,
    pub branch: Option<String>,
    pub state: String,
    pub size_bytes: Option<u64>,
    pub dir_present: bool,
    pub reclaimable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageBreakdown {
    pub total_bytes: u64,
    pub db_bytes: u64,
    pub logs_bytes: u64,
    pub chats_bytes: u64,
    pub workspaces: Vec<WorkspaceStorage>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_kind_serializes_camel_case() {
        assert_eq!(
            serde_json::to_string(&ProcessKind::DevServer).unwrap(),
            "\"devServer\""
        );
    }

    #[test]
    fn snapshot_fields_serialize_camel_case() {
        let snap = ResourceSnapshot {
            total_cpu_percent: 1.5,
            total_memory_bytes: 1024,
            processes: vec![],
            ports: vec![],
            ports_unavailable: false,
        };
        let json = serde_json::to_value(&snap).unwrap();
        assert!(json.get("totalCpuPercent").is_some());
        assert!(json.get("portsUnavailable").is_some());
        assert!(json.get("total_cpu_percent").is_none());
    }
}
