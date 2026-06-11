use std::collections::HashSet;
use std::process::Command;

use super::types::PortInfo;

/// Parse `lsof -iTCP -sTCP:LISTEN -P -n` output into (pid, port) pairs.
/// Sample line:
/// `node    48121 dan   23u  IPv4 0x1a2b  0t0  TCP 127.0.0.1:3000 (LISTEN)`
pub fn parse_lsof(output: &str) -> Vec<(u32, u16)> {
    let mut out = Vec::new();
    for line in output.lines().skip(1) {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 9 || !line.contains("(LISTEN)") {
            continue;
        }
        let Ok(pid) = cols[1].parse::<u32>() else {
            continue;
        };
        // NAME col like `127.0.0.1:3000` or `*:3000` or `[::1]:8080`
        let Some(name) = cols.get(8) else { continue };
        let Some(port_str) = name.rsplit(':').next() else {
            continue;
        };
        if let Ok(port) = port_str.parse::<u16>() {
            out.push((pid, port));
        }
    }
    out.sort_unstable();
    out.dedup();
    out
}

/// Listening ports owned by tree PIDs, or falling inside any allocated
/// workspace range. `ranges` = (workspace_id, base, count).
pub fn filter_ports(
    listened: &[(u32, u16)],
    tree_pids: &HashSet<u32>,
    pid_names: &[(u32, String)],
    pid_workspaces: &[(u32, Option<String>)],
    ranges: &[(String, u16, u16)],
) -> Vec<PortInfo> {
    let range_owner = |port: u16| -> Option<String> {
        ranges
            .iter()
            .find(|(_, base, count)| port >= *base && port < base + count)
            .map(|(id, _, _)| id.clone())
    };
    listened
        .iter()
        .filter_map(|(pid, port)| {
            let in_tree = tree_pids.contains(pid);
            let ws_from_range = range_owner(*port);
            if !in_tree && ws_from_range.is_none() {
                return None;
            }
            let process_name = pid_names
                .iter()
                .find(|(p, _)| p == pid)
                .map(|(_, n)| n.clone());
            let workspace_id = pid_workspaces
                .iter()
                .find(|(p, _)| p == pid)
                .and_then(|(_, w)| w.clone())
                .or(ws_from_range);
            Some(PortInfo {
                port: *port,
                pid: if in_tree { Some(*pid) } else { None },
                process_name,
                workspace_id,
            })
        })
        .collect()
}

/// Run lsof. Err => caller sets `ports_unavailable: true`.
pub fn list_listening_ports() -> anyhow::Result<Vec<(u32, u16)>> {
    let output = Command::new("lsof")
        .args(["-iTCP", "-sTCP:LISTEN", "-P", "-n"])
        .output()?;
    // lsof exits 1 when nothing matches — only stdout matters.
    Ok(parse_lsof(&String::from_utf8_lossy(&output.stdout)))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
COMMAND   PID  USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    48121   dan   23u  IPv4 0x1a2b      0t0  TCP 127.0.0.1:3000 (LISTEN)
node    48121   dan   24u  IPv6 0x1a2c      0t0  TCP [::1]:3000 (LISTEN)
bun     50001   dan   11u  IPv4 0x9f00      0t0  TCP *:55100 (LISTEN)
Spotify   902   dan   88u  IPv4 0x0001      0t0  TCP 127.0.0.1:57621 (LISTEN)
weird     903   dan   88u  IPv4 0x0002      0t0  TCP 1.2.3.4:443->5.6.7.8:1 (ESTABLISHED)
";

    #[test]
    fn parses_listen_lines_and_dedups() {
        let pairs = parse_lsof(SAMPLE);
        assert_eq!(pairs, vec![(902, 57621), (48121, 3000), (50001, 55100)]);
    }

    #[test]
    fn ignores_non_listen_and_garbage() {
        assert!(parse_lsof("COMMAND PID\ngarbage line\n").is_empty());
    }

    #[test]
    fn filter_keeps_tree_pids_and_range_ports_only() {
        let listened = vec![(902, 57621), (48121, 3000), (50001, 55100)];
        let tree: HashSet<u32> = HashSet::from([48121]);
        let names = vec![(48121, "node".to_string())];
        let pid_ws = vec![(48121, Some("ws1".to_string()))];
        let ranges = vec![("ws2".to_string(), 55100, 10)];
        let ports = filter_ports(&listened, &tree, &names, &pid_ws, &ranges);
        assert_eq!(ports.len(), 2);
        let p3000 = ports.iter().find(|p| p.port == 3000).unwrap();
        assert_eq!(p3000.workspace_id.as_deref(), Some("ws1"));
        assert_eq!(p3000.pid, Some(48121));
        let p55100 = ports.iter().find(|p| p.port == 55100).unwrap();
        assert_eq!(p55100.workspace_id.as_deref(), Some("ws2"));
        assert_eq!(p55100.pid, None); // 50001 not in tree
        assert!(!ports.iter().any(|p| p.port == 57621)); // Spotify dropped
    }
}
