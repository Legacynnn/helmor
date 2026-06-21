//! Integration tests for the `plans` file store: git-exclude wiring and
//! create/read/write/list/set_status round-trips against a real git repo.

use std::process::Command;

use helmor_lib::plans::store;
use helmor_lib::plans::PlanLifecycle;

/// Initialise a throwaway git repo so `git rev-parse --git-path info/exclude`
/// resolves to a real `.git/info/exclude`. Configures identity + disables
/// gpg signing so any commit a test makes succeeds in CI sandboxes.
fn init_repo() -> tempfile::TempDir {
    let tmp = tempfile::tempdir().unwrap();
    let run = |args: &[&str]| {
        Command::new("git")
            .args(args)
            .current_dir(tmp.path())
            .output()
            .unwrap_or_else(|error| panic!("git {args:?} failed: {error}"));
    };
    run(&["init"]);
    run(&["config", "user.email", "helmor@example.com"]);
    run(&["config", "user.name", "Helmor Test"]);
    run(&["config", "commit.gpgsign", "false"]);
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

/// A Markdown horizontal rule (`---`) in the body after the real closing
/// fence must not be mistaken for the frontmatter close: title + status
/// must still parse from the actual frontmatter block.
#[test]
fn frontmatter_parse_ignores_horizontal_rule_in_body() {
    let tmp = init_repo();

    store::create_plan(tmp.path(), "hr", "HR Test").unwrap();
    // A frontmatter line begins with `---` followed by other text on the same
    // line. A naive `rest.find("\n---")` mistakes this `\n---...` for the
    // closing fence and stops there — cutting off `status:` which sits *after*
    // it, before the real `\n---\n` close. The body also has a real `---`
    // horizontal rule between paragraphs.
    let body = "---\ntitle: \"HR Test\"\n--- divider in notes ---\nstatus: approved\n---\n\n# HR Test\n\nFirst paragraph.\n\n---\n\nSecond paragraph.\n";
    store::write_plan(tmp.path(), "hr", body).unwrap();

    let doc = store::read_plan(tmp.path(), "hr").unwrap();
    assert_eq!(doc.summary.title, "HR Test");
    assert_eq!(doc.summary.status, PlanLifecycle::Approved);
}

/// `write_plan` is self-contained: it works against a fresh workspace with
/// no prior `create_plan` (the plans dir does not yet exist) and creates
/// the file on disk.
#[test]
fn write_plan_to_fresh_workspace_creates_file() {
    let tmp = init_repo();

    let body = "---\ntitle: \"Fresh\"\nstatus: draft\n---\n\n# Fresh\n";
    let summary = store::write_plan(tmp.path(), "fresh", body).unwrap();
    assert_eq!(summary.slug, "fresh");
    assert_eq!(summary.title, "Fresh");

    assert!(tmp.path().join(".helmor/plans/fresh.mdx").is_file());
    let doc = store::read_plan(tmp.path(), "fresh").unwrap();
    assert_eq!(doc.content, body);

    // write_plan self-excludes: the git-exclude rule must exist even though
    // create_plan was never called for this fresh workspace.
    let exclude = std::fs::read_to_string(tmp.path().join(".git/info/exclude")).unwrap();
    assert!(
        exclude.contains("/.helmor/"),
        "write_plan must ensure the /.helmor/ git-exclude rule exists"
    );
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

/// `delete_plan` removes the `.mdx` file so `read_plan` then errors, and a
/// second delete is still Ok (idempotent: a missing file is fine).
#[test]
fn delete_plan_removes_file_and_is_idempotent() {
    let tmp = init_repo();

    store::create_plan(tmp.path(), "foo", "Foo").unwrap();
    assert!(store::read_plan(tmp.path(), "foo").is_ok());

    store::delete_plan(tmp.path(), "foo").unwrap();
    assert!(store::read_plan(tmp.path(), "foo").is_err());

    // Second delete on the now-missing file is idempotent.
    store::delete_plan(tmp.path(), "foo").unwrap();
}
