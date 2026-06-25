pub mod canvas;
pub mod db;
pub mod integration_connections;
pub mod paired_devices;
pub mod repos;
pub mod session_inspection;
pub mod sessions;
pub mod settings;
pub mod slack_workspaces;
pub mod tasks;
pub mod workspaces;

// Keep the models namespace focused on persistence-facing code. Workflow and
// integration logic live in sibling domain modules (`workspace`, `github`,
// `git`, `commands`).
