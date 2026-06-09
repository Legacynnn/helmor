---
"helmor": minor
---

Overhaul the Dashboard kanban board so it's both clearer to read and actually draggable.

- Each column now has a tinted header with a status icon (Backlog, In progress, Review, Done, Canceled) so columns are distinguishable at a glance.
- Fixed drag-and-drop (cards were previously not draggable in the app): drag a card to reorder it within a column or move it between columns, with a ghost-card preview, column highlight, and optimistic status update.
- Cards show more at a glance: a branch icon, a pull-request state icon (open / merged / closed), and a diff summary of additions, deletions, and changed files.
- Added repository and column filters in the board header; both selections are remembered across restarts.
