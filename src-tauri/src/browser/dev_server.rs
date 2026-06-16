//! Pure localhost dev-server port extraction (Rust mirror of the TS
//! `live-reload/detect-ports.ts`). Used to decide when a navigated URL points
//! at a project dev server worth live-reload watching.

use std::collections::BTreeSet;

const COMMON_DEV_PORTS: [u16; 5] = [3000, 4200, 5173, 8000, 8080];

/// Extract a deduped, ascending list of localhost ports from `command`.
pub fn extract_localhost_ports(command: &str) -> Vec<u16> {
    let mut set: BTreeSet<u16> = BTreeSet::new();

    // host:port matches.
    for token in command.split(|c: char| c.is_whitespace() || c == '&' || c == ';') {
        for prefix in ["localhost:", "127.0.0.1:"] {
            if let Some(rest) = token
                .strip_prefix(prefix)
                .or_else(|| token.find(prefix).map(|i| &token[i + prefix.len()..]))
            {
                let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                if let Ok(p) = digits.parse::<u16>() {
                    set.insert(p);
                }
            }
        }
    }

    // bare common dev ports.
    for token in command.split(|c: char| !c.is_ascii_digit()) {
        if let Ok(p) = token.parse::<u16>() {
            if COMMON_DEV_PORTS.contains(&p) {
                set.insert(p);
            }
        }
    }

    set.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_host_ports() {
        assert_eq!(
            extract_localhost_ports("vite localhost:5173 & serve 127.0.0.1:8080"),
            vec![5173, 8080]
        );
    }

    #[test]
    fn extracts_bare_common_ports() {
        assert_eq!(extract_localhost_ports("next dev -p 3000"), vec![3000]);
    }

    #[test]
    fn dedupes() {
        assert_eq!(
            extract_localhost_ports("PORT=5173 vite localhost:5173"),
            vec![5173]
        );
    }

    #[test]
    fn ignores_non_dev_numbers() {
        assert_eq!(
            extract_localhost_ports("bun run build 42"),
            Vec::<u16>::new()
        );
    }
}
