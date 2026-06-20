//! Integration tests for the `plans` file store: git-exclude wiring and
//! create/read/write/list/set_status round-trips against a real git repo.

use std::process::Command;

use helmor_lib::plans::store;
use helmor_lib::plans::PlanLifecycle;

/// Initialise a throwaway git repo so `git rev-parse --git-path info/exclude`
/// resolves to a real `.git/info/exclude`.
fn init_repo() -> tempfile::TempDir {
    let tmp = tempfile::tempdir().unwrap();
    Command::new("git")
        .arg("init")
        .current_dir(tmp.path())
        .output()
        .expect("git init");
    tmp
}

/// `ensure_excluded` writes `/.helmor/` to the repo-local exclude and is
/// idempotent: a second call must not duplicate the rule.
#[test]
fn ensure_excluded_adds_helmor_rule_and_is_idempotent() {
    let tmp = init_repo();

    store::ensure_excluded(tmp.path()).unwrap();
    let exclude = std::fs::read_to_string(tmp.path().join(".git/info/exclude")).unwrap();
    assert!(exclude.contains("/.helmor/"), "exclude should contain rule");

    store::ensure_excluded(tmp.path()).unwrap();
    let exclude2 = std::fs::read_to_string(tmp.path().join(".git/info/exclude")).unwrap();
    assert_eq!(
        exclude2.matches("/.helmor/").count(),
        1,
        "rule must appear exactly once after two calls"
    );
}

/// `create_plan` then `read_plan` round-trips slug, path, title, status and
/// content.
#[test]
fn create_then_read_roundtrips_summary_and_content() {
    let tmp = init_repo();

    let summary = store::create_plan(tmp.path(), "my-feature", "My Feature").unwrap();
    assert_eq!(summary.slug, "my-feature");
    assert_eq!(summary.path, ".helmor/plans/my-feature.mdx");
    assert_eq!(summary.title, "My Feature");
    assert_eq!(summary.status, PlanLifecycle::Draft);

    let doc = store::read_plan(tmp.path(), "my-feature").unwrap();
    assert_eq!(doc.summary.title, "My Feature");
    assert_eq!(doc.summary.status, PlanLifecycle::Draft);
    assert!(doc.content.contains("My Feature"));
}

/// Writing fresh frontmatter with `status: approved` is reflected by
/// `list_plans`.
#[test]
fn write_then_list_reflects_status_from_frontmatter() {
    let tmp = init_repo();

    store::create_plan(tmp.path(), "p1", "P1").unwrap();
    let new_body = "---\ntitle: \"P1\"\nstatus: approved\n---\n\n# P1\n\nbody\n";
    store::write_plan(tmp.path(), "p1", new_body).unwrap();

    let list = store::list_plans(tmp.path()).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].slug, "p1");
    assert_eq!(list[0].status, PlanLifecycle::Approved);
}

/// `set_status` rewrites the frontmatter `status:` line and `read_plan`
/// reflects the new lifecycle while keeping the title.
#[test]
fn set_status_updates_frontmatter_and_read_reflects_it() {
    let tmp = init_repo();

    store::create_plan(tmp.path(), "p2", "P2").unwrap();
    let summary = store::set_status(tmp.path(), "p2", PlanLifecycle::Approved).unwrap();
    assert_eq!(summary.status, PlanLifecycle::Approved);
    assert_eq!(summary.title, "P2");

    let doc = store::read_plan(tmp.path(), "p2").unwrap();
    assert_eq!(doc.summary.status, PlanLifecycle::Approved);
    assert_eq!(doc.summary.title, "P2");
}
