use std::fs;
use tempfile::TempDir;

use helmor_lib::workspace::files::content_search::{
    search_content, ContentSearchResult, MAX_FILES, MAX_MATCHES_PER_FILE,
};

fn write(root: &std::path::Path, rel: &str, content: &str) {
    let path = root.join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, content).unwrap();
}

fn small_fixture() -> TempDir {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(
        root,
        "src/index.ts",
        "import { foo } from \"./bar\";\nexport const greeting = \"hello\";\n",
    );
    write(
        root,
        "src/widget.tsx",
        "export function Widget() {\n  return <div>hello world</div>;\n}\n",
    );
    write(root, "README.md", "# Project\n\nSays hello to the world.\n");
    tmp
}

fn normalize(mut result: ContentSearchResult) -> ContentSearchResult {
    // Strip absolute paths so snapshots are stable across machines.
    for hit in result.hits.iter_mut() {
        hit.absolute_path = String::from("<ABS>");
    }
    result
}

#[test]
fn short_queries_return_empty() {
    let tmp = small_fixture();
    let result = search_content(tmp.path().to_str().unwrap(), "he").unwrap();
    assert!(result.hits.is_empty());
    assert_eq!(result.total_files_matched, 0);
}

#[test]
fn basic_match_across_files() {
    let tmp = small_fixture();
    let result = search_content(tmp.path().to_str().unwrap(), "hello").unwrap();
    insta::with_settings!({ sort_maps => true }, {
        insta::assert_yaml_snapshot!(normalize(result));
    });
}

#[test]
fn smart_case_insensitive_when_lowercase() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(root, "a.txt", "Hello World\nhello world\nHELLO WORLD\n");
    let result = search_content(root.to_str().unwrap(), "hello").unwrap();
    assert_eq!(result.hits.len(), 1);
    assert_eq!(result.hits[0].matches.len(), 3);
}

#[test]
fn smart_case_sensitive_when_mixed_case() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(root, "a.txt", "Hello World\nhello world\nHELLO WORLD\n");
    let result = search_content(root.to_str().unwrap(), "Hello").unwrap();
    assert_eq!(result.hits.len(), 1);
    assert_eq!(result.hits[0].matches.len(), 1);
}

#[test]
fn utf16_offsets_for_non_ascii_lines() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    // 🎉 is one Unicode scalar but two UTF-16 code units (a surrogate pair).
    // Confirms we return UTF-16 offsets (slice-safe in JS), not byte
    // offsets (which would corrupt the highlight after the emoji).
    write(root, "u.txt", "🎉 hello world\n");
    let result = search_content(root.to_str().unwrap(), "hello").unwrap();
    assert_eq!(result.hits.len(), 1);
    let m = &result.hits[0].matches[0];
    // "🎉 " = 2 (surrogate pair) + 1 (space) = 3 UTF-16 code units before "hello".
    assert_eq!(m.match_ranges, vec![(3, 8)]);
}

#[test]
fn skips_binary_files() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    // PNG signature followed by a NUL byte trips grep-searcher's binary detector.
    let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    bytes.extend_from_slice(b"hello world hello world\0hello\n");
    fs::write(root.join("image.png"), bytes).unwrap();
    write(root, "notes.txt", "hello world\n");
    let result = search_content(root.to_str().unwrap(), "hello").unwrap();
    assert_eq!(result.hits.len(), 1);
    assert_eq!(result.hits[0].file_name, "notes.txt");
}

#[test]
fn respects_gitignore() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    fs::create_dir_all(root.join(".git")).unwrap();
    write(root, ".gitignore", "secret.txt\n");
    write(root, "secret.txt", "hello secret\n");
    write(root, "public.txt", "hello public\n");
    let result = search_content(root.to_str().unwrap(), "hello").unwrap();
    assert_eq!(result.hits.len(), 1);
    assert_eq!(result.hits[0].file_name, "public.txt");
}

#[test]
fn includes_dotfiles() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(
        root,
        ".github/workflows/ci.yml",
        "name: CI\non: push\njobs:\n  build:\n",
    );
    let result = search_content(root.to_str().unwrap(), "push").unwrap();
    assert_eq!(result.hits.len(), 1);
    assert_eq!(result.hits[0].relative_path, ".github/workflows/ci.yml");
}

#[test]
fn skips_dotgit_directory() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(root, ".git/HEAD", "ref: refs/heads/main\n");
    write(root, "src/main.rs", "fn main() { println!(\"hello\"); }\n");
    let result = search_content(root.to_str().unwrap(), "main").unwrap();
    for hit in &result.hits {
        assert!(!hit.relative_path.starts_with(".git/"));
    }
}

#[test]
fn caps_matches_per_file_with_total_in_file_counter() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    let mut content = String::new();
    for _ in 0..20 {
        content.push_str("needle here\n");
    }
    write(root, "a.txt", &content);
    let result = search_content(root.to_str().unwrap(), "needle").unwrap();
    assert_eq!(result.hits.len(), 1);
    assert_eq!(result.hits[0].matches.len(), MAX_MATCHES_PER_FILE);
    assert_eq!(result.hits[0].total_matches_in_file, 20);
    assert!(result.truncated);
}

#[test]
fn caps_total_files_with_truncation_banner_state() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    for i in 0..(MAX_FILES + 5) {
        write(root, &format!("f_{i:03}.txt"), "needle\n");
    }
    let result = search_content(root.to_str().unwrap(), "needle").unwrap();
    assert_eq!(result.hits.len(), MAX_FILES);
    assert_eq!(result.total_files_matched, (MAX_FILES + 5) as u32);
    assert!(result.truncated);
}

#[test]
fn context_lines_attached_to_matches() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(root, "a.txt", "line one\nfind me\nline three\n");
    let result = search_content(root.to_str().unwrap(), "find").unwrap();
    let m = &result.hits[0].matches[0];
    assert_eq!(m.context_before.as_deref(), Some("line one"));
    assert_eq!(m.context_after.as_deref(), Some("line three"));
}

#[test]
fn results_are_alphabetical_by_relative_path() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(root, "z.txt", "hello\n");
    write(root, "a.txt", "hello\n");
    write(root, "m.txt", "hello\n");
    let result = search_content(root.to_str().unwrap(), "hello").unwrap();
    let paths: Vec<_> = result
        .hits
        .iter()
        .map(|h| h.relative_path.as_str())
        .collect();
    assert_eq!(paths, vec!["a.txt", "m.txt", "z.txt"]);
}
