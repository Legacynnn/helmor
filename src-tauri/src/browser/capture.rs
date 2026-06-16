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

use anyhow::{bail, Context, Result};
use image::{DynamicImage, GenericImage, ImageFormat, RgbaImage};
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

/// Write raw stitched PNG bytes into the per-session paste-cache as
/// `fullpage-<uuid>.png`, returning the absolute path. Mirrors
/// `save_capture_png` but skips the base64 round-trip (the stitcher already
/// holds decoded bytes).
pub fn save_stitched_png(session_id: &str, png_bytes: &[u8]) -> Result<String> {
    let paste_root = crate::data_dir::paste_cache_dir()?;
    let paste_dir = crate::maintenance::paste_cache::destination_dir(&paste_root, session_id)?;
    fs::create_dir_all(&paste_dir).context("Failed to create capture-cache directory")?;

    let filename = format!("fullpage-{}.png", Uuid::new_v4());
    let filepath: PathBuf = paste_dir.join(&filename);
    fs::write(&filepath, png_bytes)
        .with_context(|| format!("Failed to write stitched capture to {}", filepath.display()))?;

    Ok(filepath.to_string_lossy().to_string())
}

/// Write raw simulator-screenshot PNG bytes into the per-session paste-cache as
/// `simulator-<uuid>.png`, returning the absolute path. Mirrors
/// `save_stitched_png` (raw bytes, no base64 round-trip); the iOS/Android
/// capture paths already hold decoded PNG bytes.
pub fn save_simulator_to_cache(
    paste_root: &Path,
    session_id: &str,
    png_bytes: &[u8],
) -> Result<String> {
    let paste_dir = crate::maintenance::paste_cache::destination_dir(paste_root, session_id)?;
    fs::create_dir_all(&paste_dir).context("Failed to create capture-cache directory")?;

    let filename = format!("simulator-{}.png", Uuid::new_v4());
    let filepath: PathBuf = paste_dir.join(&filename);
    fs::write(&filepath, png_bytes).with_context(|| {
        format!(
            "Failed to write simulator capture to {}",
            filepath.display()
        )
    })?;

    Ok(filepath.to_string_lossy().to_string())
}

/// Save raw simulator PNG bytes into the real per-session paste-cache and return
/// the absolute path. Thin wrapper resolving `paste_cache_dir()`.
pub fn save_simulator_png(session_id: &str, png_bytes: &[u8]) -> Result<String> {
    let paste_root = crate::data_dir::paste_cache_dir()?;
    save_simulator_to_cache(&paste_root, session_id, png_bytes)
}

/// Vertically stack PNG byte slices (top → bottom scroll order) into a single
/// PNG. All segments must share the same width — they come from one viewport
/// scrolled down a full-page capture, so a width mismatch signals a corrupt /
/// misordered segment and is rejected rather than silently letter-boxed.
///
/// CPU-bound (decode + recompose + re-encode); callers run it off the main
/// thread via `run_blocking` / `spawn_blocking`.
///
/// CAVEAT: the page-side segment collector cannot recover content that was
/// never rendered. Pages using virtualized lists (rows unmounted when scrolled
/// out of view) or lazy-loaded media may stitch with gaps; the scroll-step
/// overlap in `capture/fullpage.ts` only mitigates lazy-load timing, not
/// virtualization.
pub fn stitch_segments(segments: Vec<Vec<u8>>) -> Result<Vec<u8>> {
    if segments.is_empty() {
        bail!("stitch_segments: segment list is empty");
    }

    let decoded: Vec<DynamicImage> = segments
        .iter()
        .enumerate()
        .map(|(i, bytes)| {
            image::load_from_memory(bytes)
                .with_context(|| format!("stitch_segments: failed to decode segment {i}"))
        })
        .collect::<Result<Vec<_>>>()?;

    let width = decoded[0].width();
    for (i, img) in decoded.iter().enumerate().skip(1) {
        if img.width() != width {
            bail!(
                "stitch_segments: segment {i} width {} != expected {width}",
                img.width(),
            );
        }
    }

    let total_height: u32 = decoded.iter().map(|img| img.height()).sum();
    let mut canvas = RgbaImage::new(width, total_height);

    let mut y_offset = 0u32;
    for img in &decoded {
        let rgba = img.to_rgba8();
        canvas
            .copy_from(&rgba, 0, y_offset)
            .with_context(|| format!("stitch_segments: copy_from failed at y_offset {y_offset}"))?;
        y_offset += img.height();
    }

    let mut out = Vec::new();
    DynamicImage::ImageRgba8(canvas)
        .write_to(&mut std::io::Cursor::new(&mut out), ImageFormat::Png)
        .context("stitch_segments: PNG encode failed")?;

    Ok(out)
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
    fn save_simulator_png_writes_into_cache() {
        let tmp = tempfile::tempdir().unwrap();
        let png = decode_base64_png(PNG_1X1_B64).unwrap();
        let session_id = "aabbccdd-1111-2222-3333-444455556666";
        let path = save_simulator_to_cache(tmp.path(), session_id, &png).unwrap();
        assert!(path.ends_with(".png"));
        assert!(path.contains("simulator-"));
        assert!(std::path::Path::new(&path).exists());
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

    /// Encode a solid-color RGB image as in-memory PNG bytes for stitch tests.
    fn solid_png(width: u32, height: u32, color: [u8; 3]) -> Vec<u8> {
        let img = image::RgbImage::from_fn(width, height, |_, _| image::Rgb(color));
        let mut buf = Vec::new();
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut std::io::Cursor::new(&mut buf), ImageFormat::Png)
            .unwrap();
        buf
    }

    #[test]
    fn stitch_two_segments_sums_heights_keeps_width() {
        let top = solid_png(800, 600, [255, 0, 0]);
        let bottom = solid_png(800, 400, [0, 0, 255]);
        let stitched = stitch_segments(vec![top, bottom]).unwrap();

        let img = image::load_from_memory(&stitched).unwrap();
        assert_eq!(img.width(), 800);
        assert_eq!(img.height(), 1000, "600 + 400 = 1000");
    }

    #[test]
    fn stitch_single_segment_round_trips_dimensions() {
        let seg = solid_png(1024, 768, [128, 64, 32]);
        let stitched = stitch_segments(vec![seg]).unwrap();
        let img = image::load_from_memory(&stitched).unwrap();
        assert_eq!(img.width(), 1024);
        assert_eq!(img.height(), 768);
    }

    #[test]
    fn stitch_empty_segments_errors() {
        assert!(stitch_segments(vec![]).is_err());
    }

    #[test]
    fn stitch_mismatched_widths_errors() {
        let top = solid_png(800, 600, [255, 0, 0]);
        let bottom = solid_png(1024, 600, [0, 255, 0]);
        let err = stitch_segments(vec![top, bottom]).unwrap_err();
        assert!(err.to_string().contains("width"));
    }
}
