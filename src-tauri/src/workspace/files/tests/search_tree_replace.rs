use std::{fs, path::Path, process::Command};

use crate::data_dir::TEST_ENV_LOCK as TEST_LOCK;

use super::{
    list_workspace_tree, replace_in_workspace, search_workspace, support::EditorFilesHarness,
    WorkspaceReplaceRequest, WorkspaceSearchRequest,
};

fn git_init(dir: &Path) {
    let status = Command::new("git")
        .args(["init", "-q"])
        .current_dir(dir)
        .status()
        .expect("git init");
    assert!(status.success());
}

fn search_request(root: &Path, query: &str) -> WorkspaceSearchRequest {
    WorkspaceSearchRequest {
        workspace_root_path: root.to_string_lossy().to_string(),
        query: query.to_string(),
        case_sensitive: false,
        whole_word: false,
        regex: false,
        include_globs: Vec::new(),
        exclude_globs: Vec::new(),
        max_results: None,
    }
}

fn replace_request(root: &Path, query: &str, replacement: &str) -> WorkspaceReplaceRequest {
    WorkspaceReplaceRequest {
        workspace_root_path: root.to_string_lossy().to_string(),
        workspace_id: None,
        query: query.to_string(),
        case_sensitive: false,
        whole_word: false,
        regex: false,
        replacement: replacement.to_string(),
        paths: Vec::new(),
    }
}

#[test]
fn tree_hides_gitignored_and_git_dir() {
    let _lock = TEST_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let harness = EditorFilesHarness::new();
    let root = &harness.workspace_dir;
    git_init(root);
    fs::write(root.join(".gitignore"), "ignored-dir/\nsecret.txt\n").unwrap();
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(root.join("src/app.ts"), "export const app = 1;\n").unwrap();
    fs::create_dir_all(root.join("ignored-dir")).unwrap();
    fs::write(root.join("ignored-dir/hidden.ts"), "nope\n").unwrap();
    fs::write(root.join("secret.txt"), "nope\n").unwrap();

    let response = list_workspace_tree(root.to_str().unwrap()).unwrap();
    let paths: Vec<&str> = response
        .entries
        .iter()
        .map(|entry| entry.path.as_str())
        .collect();

    assert!(paths.contains(&"src"));
    assert!(paths.contains(&"src/app.ts"));
    assert!(paths.contains(&".gitignore"));
    assert!(!paths.iter().any(|path| path.starts_with("ignored-dir")));
    assert!(!paths.contains(&"secret.txt"));
    assert!(!paths.iter().any(|path| path.starts_with(".git/")));
    assert!(!response.truncated);

    let src = response
        .entries
        .iter()
        .find(|entry| entry.path == "src")
        .unwrap();
    assert!(src.is_dir);
    let app = response
        .entries
        .iter()
        .find(|entry| entry.path == "src/app.ts")
        .unwrap();
    assert!(!app.is_dir);
    assert_eq!(app.name, "app.ts");
}

#[test]
fn search_matches_with_case_word_and_regex_modes() {
    let _lock = TEST_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let harness = EditorFilesHarness::new();
    let root = &harness.workspace_dir;
    git_init(root);
    fs::write(
        root.join("main.ts"),
        "const Foo = 1;\nconst foobar = 2;\nconst foo = 3;\n",
    )
    .unwrap();

    // Default: case-insensitive substring.
    let response = search_workspace(&search_request(root, "foo")).unwrap();
    assert_eq!(response.total_matches, 3);
    let file = &response.files[0];
    assert_eq!(file.path, "main.ts");
    assert_eq!(file.matches[0].line_number, 1);
    assert_eq!(file.matches[0].prefix, "const ");
    assert_eq!(file.matches[0].matched, "Foo");
    assert_eq!(file.matches[0].suffix, " = 1;");

    // Case-sensitive.
    let mut request = search_request(root, "foo");
    request.case_sensitive = true;
    assert_eq!(search_workspace(&request).unwrap().total_matches, 2);

    // Whole word.
    let mut request = search_request(root, "foo");
    request.whole_word = true;
    assert_eq!(search_workspace(&request).unwrap().total_matches, 2);

    // Regex.
    let mut request = search_request(root, r"foo\w+");
    request.regex = true;
    let response = search_workspace(&request).unwrap();
    assert_eq!(response.total_matches, 1);
    assert_eq!(response.files[0].matches[0].matched, "foobar");

    // Literal mode escapes regex metacharacters.
    fs::write(root.join("meta.ts"), "value = a.b;\n").unwrap();
    let response = search_workspace(&search_request(root, "a.b")).unwrap();
    assert_eq!(response.total_matches, 1);
    assert_eq!(response.files[0].path, "meta.ts");
}

#[test]
fn search_respects_gitignore_globs_and_cap() {
    let _lock = TEST_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let harness = EditorFilesHarness::new();
    let root = &harness.workspace_dir;
    git_init(root);
    fs::write(root.join(".gitignore"), "dist/\n").unwrap();
    fs::create_dir_all(root.join("dist")).unwrap();
    fs::write(root.join("dist/out.js"), "needle\n").unwrap();
    fs::write(root.join("a.ts"), "needle\n").unwrap();
    fs::write(root.join("b.md"), "needle\nneedle\n").unwrap();

    let response = search_workspace(&search_request(root, "needle")).unwrap();
    assert_eq!(response.total_matches, 3);
    assert!(!response
        .files
        .iter()
        .any(|file| file.path.starts_with("dist")));

    let mut request = search_request(root, "needle");
    request.include_globs = vec!["*.ts".to_string()];
    let response = search_workspace(&request).unwrap();
    assert_eq!(response.total_matches, 1);
    assert_eq!(response.files[0].path, "a.ts");

    let mut request = search_request(root, "needle");
    request.exclude_globs = vec!["*.md".to_string()];
    let response = search_workspace(&request).unwrap();
    assert_eq!(response.total_matches, 1);
    assert_eq!(response.files[0].path, "a.ts");

    let mut request = search_request(root, "needle");
    request.max_results = Some(1);
    let response = search_workspace(&request).unwrap();
    assert_eq!(response.total_matches, 1);
    assert!(response.truncated);
}

#[test]
fn search_reports_file_name_matches() {
    let _lock = TEST_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let harness = EditorFilesHarness::new();
    let root = &harness.workspace_dir;
    git_init(root);
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(root.join("src/needle-finder.ts"), "nothing here\n").unwrap();

    let response = search_workspace(&search_request(root, "needle")).unwrap();
    assert_eq!(response.total_matches, 0);
    assert_eq!(response.file_name_matches, vec!["src/needle-finder.ts"]);
}

#[test]
fn replace_rewrites_literal_and_regex_with_captures() {
    let _lock = TEST_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let harness = EditorFilesHarness::new();
    let root = &harness.workspace_dir;
    git_init(root);
    fs::write(root.join("a.ts"), "old(1)\nold(2)\n").unwrap();
    fs::write(root.join("b.ts"), "old(3)\nuntouched\n").unwrap();

    let mut request = replace_request(root, "old", "new");
    request.paths = vec!["a.ts".to_string(), "b.ts".to_string()];
    let response = replace_in_workspace(&request).unwrap();
    assert_eq!(response.files_changed, 2);
    assert_eq!(response.replacements, 3);
    assert_eq!(
        fs::read_to_string(root.join("a.ts")).unwrap(),
        "new(1)\nnew(2)\n"
    );
    assert_eq!(
        fs::read_to_string(root.join("b.ts")).unwrap(),
        "new(3)\nuntouched\n"
    );

    // Regex with capture refs. Literal replacement must NOT expand $1.
    fs::write(root.join("c.ts"), "call(alpha)\n").unwrap();
    let mut request = replace_request(root, r"call\((\w+)\)", "invoke($1)");
    request.regex = true;
    request.paths = vec!["c.ts".to_string()];
    let response = replace_in_workspace(&request).unwrap();
    assert_eq!(response.replacements, 1);
    assert_eq!(
        fs::read_to_string(root.join("c.ts")).unwrap(),
        "invoke(alpha)\n"
    );

    fs::write(root.join("d.ts"), "price\n").unwrap();
    let mut request = replace_request(root, "price", "$1 literal");
    request.paths = vec!["d.ts".to_string()];
    replace_in_workspace(&request).unwrap();
    assert_eq!(
        fs::read_to_string(root.join("d.ts")).unwrap(),
        "$1 literal\n"
    );
}

#[test]
fn replace_skips_binary_and_rejects_escaping_paths() {
    let _lock = TEST_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let harness = EditorFilesHarness::new();
    let root = &harness.workspace_dir;
    git_init(root);
    fs::write(root.join("bin.dat"), b"nee\x00dle").unwrap();

    let mut request = replace_request(root, "needle", "thread");
    request.paths = vec!["bin.dat".to_string()];
    let response = replace_in_workspace(&request).unwrap();
    assert_eq!(response.files_changed, 0);

    let outside_file = harness.outside_dir.join("escape.txt");
    fs::write(&outside_file, "needle\n").unwrap();
    let mut request = replace_request(root, "needle", "thread");
    request.paths = vec![format!("../outside/{}", "escape.txt")];
    assert!(replace_in_workspace(&request).is_err());
    assert_eq!(fs::read_to_string(&outside_file).unwrap(), "needle\n");
}

#[test]
fn replace_whole_word_only_touches_word_matches() {
    let _lock = TEST_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let harness = EditorFilesHarness::new();
    let root = &harness.workspace_dir;
    git_init(root);
    fs::write(root.join("w.ts"), "cat catalog cat\n").unwrap();

    let mut request = replace_request(root, "cat", "dog");
    request.whole_word = true;
    request.paths = vec!["w.ts".to_string()];
    let response = replace_in_workspace(&request).unwrap();
    assert_eq!(response.replacements, 2);
    assert_eq!(
        fs::read_to_string(root.join("w.ts")).unwrap(),
        "dog catalog dog\n"
    );
}
