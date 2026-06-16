//! Snapshot tests for the simulator a11y/view-hierarchy parsers. The parsers
//! take `&str` and never shell out.

use helmor_lib::preview::simulator_driver::{parse_idb_describe_all, parse_uiautomator_dump};

#[test]
fn parse_idb_describe_all_snapshot() {
    let json = include_str!("fixtures/simulator/idb-describe-all.json");
    let parsed = parse_idb_describe_all(json).unwrap();
    insta::assert_json_snapshot!(parsed);
}

#[test]
fn parse_uiautomator_dump_snapshot() {
    let xml = include_str!("fixtures/simulator/uiautomator-dump.xml");
    let parsed = parse_uiautomator_dump(xml).unwrap();
    insta::assert_json_snapshot!(parsed);
}

/// End-to-end: open a simulator surface, dispatch `evaluate` through the broker,
/// and assert it routes to the SimulatorDriver's structured-unsupported path.
#[tokio::test]
async fn evaluate_returns_unsupported_via_broker() {
    use std::sync::Arc;

    use helmor_lib::preview::broker::{dispatch, registry, PreviewCall, RegisteredSurface};
    use helmor_lib::preview::driver::{PreviewError, PreviewSurfaceKind};
    use helmor_lib::preview::simulator_driver::{ProcessExecutor, SimulatorDriver};

    let workspace_id = "ws-eval-broker";
    registry().register(
        workspace_id,
        RegisteredSurface {
            kind: PreviewSurfaceKind::SimulatorIos,
            driver: Arc::new(SimulatorDriver::new(
                PreviewSurfaceKind::SimulatorIos,
                "UDID-1".into(),
                Arc::new(ProcessExecutor),
            )),
        },
    );

    let app = tauri::test::mock_app();
    let result = dispatch(
        app.handle(),
        workspace_id,
        PreviewCall::Evaluate {
            script: "1+1".into(),
        },
    )
    .await;

    registry().unregister(workspace_id);

    let err = result.expect_err("evaluate must be unsupported on simulators");
    assert!(matches!(err, PreviewError::Unsupported { .. }));
    assert_eq!(err, PreviewError::unsupported("evaluate is browser-only"));
}
