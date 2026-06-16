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
