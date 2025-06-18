
CREATE TABLE widgets (
    id String,
    dashboard_id String,
    type Enum8(
        'SCORE_AGGREGATE' = 1,
        'COST_BY_TIME' = 2,
        'USAGE_BY_TIME' = 3,
        'CUSTOM_METRIC' = 4,
        'TABLE_VIEW' = 5,
        'TIME_SERIES' = 6,
        'BAR_CHART' = 7,
        'PIE_CHART' = 8
    ),
    title String,
    position_x UInt16 DEFAULT 0,
    position_y UInt16 DEFAULT 0,
    size_width UInt16 DEFAULT 6,
    size_height UInt16 DEFAULT 4,
    configuration String, -- JSON string for widget configuration
    refresh_interval Nullable(UInt32), -- Refresh interval in seconds
    created_at DateTime64(3) DEFAULT now64(),
    updated_at DateTime64(3) DEFAULT now64(),
    deleted_at Nullable(DateTime64(3)),
    version UInt32 DEFAULT 1
) ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(created_at)
ORDER BY (dashboard_id, id)
SETTINGS index_granularity = 8192;

-- Index for widget type filtering
ALTER TABLE widgets ADD INDEX idx_type type TYPE set(10) GRANULARITY 1;

-- Index for dashboard widget queries
ALTER TABLE widgets ADD INDEX idx_dashboard dashboard_id TYPE bloom_filter GRANULARITY 1;

-- Index for widget title search
ALTER TABLE widgets ADD INDEX idx_title_bloom title TYPE bloom_filter GRANULARITY 1;

