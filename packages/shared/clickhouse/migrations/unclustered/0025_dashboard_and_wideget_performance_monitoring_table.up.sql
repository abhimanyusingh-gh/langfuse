CREATE TABLE dashboard_access_log (
    dashboard_id String,
    user_id String,
    access_type Enum8('VIEW' = 1, 'EDIT' = 2, 'SHARE' = 3),
    ip_address IPv4,
    user_agent String,
    timestamp DateTime64(3) DEFAULT now64()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (dashboard_id, timestamp)
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

CREATE TABLE widget_query_performance (
    widget_id String,
    query_hash String,
    execution_time_ms UInt32,
    rows_processed UInt64,
    bytes_processed UInt64,
    cache_hit Bool DEFAULT false,
    error_message Nullable(String),
    timestamp DateTime64(3) DEFAULT now64()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (widget_id, timestamp)
TTL timestamp + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;
