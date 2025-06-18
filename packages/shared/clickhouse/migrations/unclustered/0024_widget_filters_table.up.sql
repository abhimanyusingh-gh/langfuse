CREATE TABLE widget_filters (
    id String,
    widget_id String,
    column_table_id String,
    column_id String,
    operator Enum8(
        'EQUALS' = 1,
        'NOT_EQUALS' = 2,
        'GREATER_THAN' = 3,
        'LESS_THAN' = 4,
        'GREATER_EQUAL' = 5,
        'LESS_EQUAL' = 6,
        'IN' = 7,
        'NOT_IN' = 8,
        'LIKE' = 9,
        'NOT_LIKE' = 10,
        'BETWEEN' = 11
    ),
    filter_value String, -- JSON string for filter values
    is_global Bool DEFAULT false,
    created_at DateTime64(3) DEFAULT now64(),
    updated_at DateTime64(3) DEFAULT now64(),
    version UInt32 DEFAULT 1
) ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(created_at)
ORDER BY (widget_id, id)
SETTINGS index_granularity = 8192;
