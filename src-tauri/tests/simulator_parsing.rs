//! Snapshot tests for the simulator a11y/view-hierarchy parsers. The parsers
//! take `&str` and never shell out.

use helmor_lib::preview::simulator_driver::parse_idb_describe_all;

#[test]
fn parse_idb_describe_all_snapshot() {
    let json = include_str!("fixtures/simulator/idb-describe-all.json");
    let parsed = parse_idb_describe_all(json).unwrap();
    insta::assert_json_snapshot!(parsed);
}
