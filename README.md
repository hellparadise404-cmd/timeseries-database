# Time-Series Database — Mini Data Viewer

A clean, modern web application for analyzing, aggregating, and visualizing time-series CSV metrics with Supabase authentication and historical persistent storage.

## Features
- **Authentication**: Email/Password authentication & Google OAuth via Supabase
- **Upload & Validate**: Drag-and-drop CSV upload with smart column auto-detection and data validation
- **Aggregation & Visualization**: Time-bucketed aggregation (15m, 30m, 1h) with interactive Chart.js line charts
- **Summary Statistics**: Overall count, average, min, max, and skipped record tracking
- **History & Persistence**: All uploaded datasets are stored in Supabase with user isolation (RLS) to revisit anytime
- **Data Export**: Export aggregated bucket results to CSV

## Tech Stack
- Frontend: Vanilla HTML5, CSS3, JavaScript (ES6+)
- Styling: Custom modern UI inspired by time-series observability platforms
- Charts: Chart.js
- Backend & Auth: Supabase (PostgreSQL + Auth + Row Level Security)

## Setup & Running Locally
Simply open `index.html` in any modern web browser or serve via a lightweight HTTP server:
```bash
python -m http.server 8080
```
Then navigate to `http://localhost:8080`.
