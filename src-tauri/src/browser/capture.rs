//! Browser screenshot persistence.
//!
//! Writes a base64-encoded PNG (produced by the content-webview capture
//! bridge) into the per-session paste-cache bucket, returning the absolute
//! path. Reuses the exact paste-cache infrastructure that `save_pasted_image`
//! uses (`maintenance::paste_cache::destination_dir` + `data_dir`), so the
//! returned path travels through `AgentSendRequest.images` identically to a
//! pasted image. The `maintenance::paste_cache` sweeper reclaims unclaimed
//! buckets together, regardless of the `paste-`/`capture-` filename prefix.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use uuid::Uuid;

use crate::commands::system_commands::base64_decode;

/// PNG file signature (the 8-byte magic that opens every PNG stream).
const PNG_MAGIC: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

/// Decode a base64-encoded PNG into raw bytes, validating the PNG signature.
///
/// Pure helper: no filesystem access. Rejects input that decodes to bytes not
/// starting with the PNG magic, so a mis-encoded payload fails fast before we
/// write a junk `.png` into the cache.
pub fn decode_base64_png(data_b64: &str) -> Result<Vec<u8>> {
    let bytes = base64_decode(data_b64).context("Invalid base64 data for browser capture")?;
    if bytes.len() < PNG_MAGIC.len() || bytes[..PNG_MAGIC.len()] != PNG_MAGIC {
        anyhow::bail!("Decoded browser capture is not a PNG (bad signature)");
    }
    Ok(bytes)
}

/// Write a base64-encoded PNG into `<paste_root>/<session_id>/capture-<uuid>.png`.
///
/// `paste_root` is normally `crate::data_dir::paste_cache_dir()`. Accepted as a
/// parameter so tests can pass a temp dir without touching the real cache.
pub fn save_capture_to_cache(
    paste_root: &Path,
    session_id: &str,
    data_b64: &str,
) -> Result<String> {
    let paste_dir = crate::maintenance::paste_cache::destination_dir(paste_root, session_id)?;
    fs::create_dir_all(&paste_dir).context("Failed to create capture-cache directory")?;

    let filename = format!("capture-{}.png", Uuid::new_v4());
    let filepath: PathBuf = paste_dir.join(&filename);

    let bytes = decode_base64_png(data_b64)?;
    fs::write(&filepath, &bytes)
        .with_context(|| format!("Failed to write capture to {}", filepath.display()))?;

    Ok(filepath.to_string_lossy().to_string())
}

/// Save a base64 PNG into the real per-session paste-cache and return the
/// absolute path. Thin wrapper resolving `paste_cache_dir()` for the command
/// layer.
pub fn save_capture_png(session_id: &str, base64_png: &str) -> Result<String> {
    let paste_root = crate::data_dir::paste_cache_dir()?;
    save_capture_to_cache(&paste_root, session_id, base64_png)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 1x1 PNG in base64 (valid PNG signature).
    const PNG_1X1_B64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==";

    #[test]
    fn decode_base64_png_returns_png_magic_bytes() {
        let bytes = decode_base64_png(PNG_1X1_B64).unwrap();
        assert_eq!(&bytes[..4], b"\x89PNG");
        assert_eq!(&bytes[..8], &PNG_MAGIC);
    }

    #[test]
    fn decode_base64_png_rejects_non_png() {
        // "hello" base64-decodes fine but is not a PNG.
        let err = decode_base64_png("aGVsbG8=").unwrap_err();
        assert!(err.to_string().contains("not a PNG"));
    }

    #[test]
    fn decode_base64_png_rejects_bad_base64() {
        assert!(decode_base64_png("!!!not base64!!!").is_err());
    }

    #[test]
    fn save_capture_creates_file_and_returns_path() {
        let dir = tempfile::tempdir().unwrap();
        let session_id = "aabbccdd-1111-2222-3333-444455556666";
        let path = save_capture_to_cache(dir.path(), session_id, PNG_1X1_B64).unwrap();
        assert!(std::path::Path::new(&path).exists());
        assert!(path.contains("capture-"));
        assert!(path.ends_with(".png"));
        assert!(path.contains(session_id));
    }
}
