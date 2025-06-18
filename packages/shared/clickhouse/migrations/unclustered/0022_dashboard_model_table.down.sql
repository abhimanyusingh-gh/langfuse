CREATE TABLE dashboards (
    id String,
    name String,
    description Nullable(String),
    project_id String,
    user_id String,
    is_public Bool DEFAULT false,
    layout_columns UInt8 DEFAULT 12,
    layout_rows UInt8 DEFAULT 8,
    layout_grid_width UInt16 DEFAULT 1200,
    layout_grid_height UInt16 DEFAULT 800,
    tags Array(String) DEFAULT [],
    created_at DateTime64(3) DEFAULT now64(),
    updated_at DateTime64(3) DEFAULT now64(),
    deleted_at Nullable(DateTime64(3)),
    version UInt32 DEFAULT 1,
    metadata String DEFAULT '{}'
) ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, user_id, id)
SETTINGS index_granularity = 8192;

-- Index for dashboard search by name
ALTER TABLE dashboards ADD INDEX idx_name_bloom name TYPE bloom_filter GRANULARITY 1;

-- Index for user dashboard queries
ALTER TABLE dashboards ADD INDEX idx_user_project (user_id, project_id) TYPE minmax GRANULARITY 3;

-- Index for public dashboard discovery
ALTER TABLE dashboards ADD INDEX idx_public is_public TYPE set(2) GRANULARITY 1;

