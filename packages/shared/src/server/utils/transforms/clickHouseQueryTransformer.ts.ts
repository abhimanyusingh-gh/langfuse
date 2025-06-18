import { ColumnRegistry } from "./clickHouseColumnRegistry";

interface WidgetConfiguration {
  primaryTable: TableConfig;
  selectedColumns: SelectedColumn[];
  aggregations: AggregationConfig[];
  groupByColumns: GroupByConfig[];
  filters: FilterConfig[];
  joinTables?: JoinConfig[];
  timeSeriesConfig?: TimeSeriesConfig;
  orderBy?: OrderByConfig[];
  limit?: number;
}

interface TableConfig {
  name: string;
  alias?: string;
  useFinal: boolean;
}

interface SelectedColumn {
  tableId: string;
  columnId: string;
  alias?: string;
  customExpression?: string;
}

interface AggregationConfig {
  function: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX" | "COUNT_DISTINCT";
  column: SelectedColumn;
  alias: string;
}

interface GroupByConfig {
  column: SelectedColumn;
  bucketSize?: "minute" | "hour" | "day" | "week" | "month";
}

interface FilterConfig {
  column: SelectedColumn;
  operator:
    | "="
    | "!="
    | ">"
    | "<"
    | ">="
    | "<="
    | "IN"
    | "NOT IN"
    | "LIKE"
    | "NOT LIKE"
    | "BETWEEN";
  value: any;
  isGlobal?: boolean;
}

interface JoinConfig {
  table: TableConfig;
  joinType: "INNER" | "LEFT" | "RIGHT" | "FULL";
  onCondition: string;
}

interface TimeSeriesConfig {
  timeColumn: string;
  bucketSize: "minute" | "hour" | "day" | "week" | "month";
  orderBy: "ASC" | "DESC";
  fillGaps: boolean;
}

interface OrderByConfig {
  column: string;
  direction: "ASC" | "DESC";
}

export class ClickHouseQueryTransformer {
  private columnRegistry: ColumnRegistry;

  constructor(columnRegistry: ColumnRegistry) {
    this.columnRegistry = columnRegistry;
  }

  public transform(
    representation: WidgetConfiguration,
    projectId: string,
  ): {
    query: string;
    parameters: Record<string, any>;
  } {
    const selectClause = this.buildSelectClause(representation);
    const fromClause = this.buildFromClause(representation.primaryTable);
    const joinClause = this.buildJoinClause(representation.joinTables || []);
    const whereClause = this.buildWhereClause(
      representation.filters,
      projectId,
      representation,
    );
    const groupByClause = this.buildGroupByClause(
      representation.groupByColumns,
      representation,
    );
    const orderByClause = this.buildOrderByClause(representation);
    const limitClause = this.buildLimitClause(representation.limit);

    const query = [
      selectClause,
      fromClause,
      joinClause,
      whereClause,
      groupByClause,
      orderByClause,
      limitClause,
    ]
      .filter((clause) => clause.trim().length > 0)
      .join("\n");

    return {
      query: query.trim(),
      parameters: this.buildParameters(representation.filters, projectId),
    };
  }

  private buildSelectClause(representation: WidgetConfiguration): string {
    const columns: string[] = [];

    // Add time series column first if configured
    if (representation.timeSeriesConfig) {
      const timeColumn = this.buildTimeSeriesColumn(
        representation.timeSeriesConfig,
        representation,
      );
      columns.push(timeColumn);
    }

    // Add selected columns
    representation.selectedColumns.forEach((col) => {
      const columnExpression = this.resolveColumnExpression(
        col,
        representation,
      );
      if (columnExpression) {
        columns.push(columnExpression);
      }
    });

    // Add aggregations
    representation.aggregations.forEach((agg) => {
      const aggExpression = this.buildAggregationExpression(
        agg,
        representation,
      );
      if (aggExpression) {
        columns.push(aggExpression);
      }
    });

    return `SELECT ${columns.join(", ")}`;
  }

  private resolveColumnExpression(
    col: SelectedColumn,
    representation: WidgetConfiguration,
  ): string | null {
    // Handle custom expressions first
    if (col.customExpression) {
      return `${col.customExpression}${col.alias ? ` as ${col.alias}` : ""}`;
    }

    // Get the proper column expression with fallback
    const columnExpression = this.getColumnExpression(
      col.tableId,
      col.columnId,
      representation,
    );
    if (!columnExpression) {
      console.warn(
        `Column definition not found for ${col.tableId}.${col.columnId}`,
      );
      return null;
    }

    return `${columnExpression}${col.alias ? ` as ${col.alias}` : ""}`;
  }

  private buildAggregationExpression(
    agg: AggregationConfig,
    representation: WidgetConfiguration,
  ): string | null {
    const columnExpression = this.getColumnExpression(
      agg.column.tableId,
      agg.column.columnId,
      representation,
    );
    if (!columnExpression) {
      console.warn(
        `Column definition not found for aggregation ${agg.column.tableId}.${agg.column.columnId}`,
      );
      return null;
    }

    // Handle different aggregation functions
    switch (agg.function) {
      case "COUNT_DISTINCT":
        return `COUNT(DISTINCT ${columnExpression}) as ${agg.alias}`;
      default:
        return `${agg.function}(${columnExpression}) as ${agg.alias}`;
    }
  }

  private getColumnExpression(
    tableId: string,
    columnId: string,
    representation: WidgetConfiguration,
  ): string | null {
    const columnDef = this.getColumnDefinition(tableId, columnId);

    // If column definition exists and has a complete internal expression, use it
    if (columnDef && columnDef.internal) {
      // If internal already contains table reference, use as-is
      if (
        columnDef.internal.includes(".") ||
        columnDef.internal.includes("(")
      ) {
        return columnDef.internal;
      }
    }

    // Build expression from scratch using proper column mapping
    const tableAlias = this.getTableAlias(tableId, representation);
    const actualColumnName = this.getActualColumnName(columnId);

    if (!this.shouldQuoteColumn(actualColumnName)) {
      console.log(actualColumnName);
    }

    const quotedColumn = this.shouldQuoteColumn(actualColumnName)
      ? `"${actualColumnName}"`
      : actualColumnName;

    return `${tableAlias}.${quotedColumn}`;
  }

  private getActualColumnName(columnId: string): string {
    // Map UI column IDs to actual database column names
    const columnMapping: Record<string, string> = {
      // Traces table mappings
      id: "id",
      name: "name",
      environment: "environment",
      userId: "user_id",
      sessionId: "session_id",
      timestamp: "timestamp",
      bookmarked: "bookmarked",
      tags: "tags",
      version: "version",
      release: "release",
      level: "level",
      metadata: "metadata",

      // Scores table mappings
      value: "value",
      source: "source",
      comment: "comment",
      dataType: "data_type",
      stringValue: "string_value",
      authorUserId: "author_user_id",
      traceId: "trace_id",
      observationId: "observation_id",

      // Observations table mappings
      type: "type",
      startTime: "start_time",
      endTime: "end_time",
      latency: "latency",
      inputCost: "input_cost",
      outputCost: "output_cost",
      totalCost: "total_cost",
      inputTokens: "input_tokens",
      outputTokens: "output_tokens",
      totalTokens: "total_tokens",
      model: "provided_model_name",
      modelId: "internal_model_id",
      statusMessage: "status_message",
      promptName: "prompt_name",
      promptVersion: "prompt_version",
    };

    return columnMapping[columnId] || columnId;
  }

  private shouldQuoteColumn(columnName: string): boolean {
    const alwaysQuote = [
      "id",
      "name",
      "environment",
      "user_id",
      "session_id",
      "timestamp",
      "value",
      "type",
      "start_time",
      "end_time",
      "level",
      "metadata",
      "version",
      "release",
      "tags",
      "source",
      "comment",
      "project_id",
    ];

    return alwaysQuote.includes(columnName) || /[^a-zA-Z0-9_]/.test(columnName);
  }

  private buildFromClause(primaryTable: TableConfig): string {
    const finalClause = primaryTable.useFinal ? " FINAL" : "";
    const alias = primaryTable.alias ? ` ${primaryTable.alias}` : "";
    return `FROM ${primaryTable.name}${finalClause}${alias}`;
  }

  private buildJoinClause(joinTables: JoinConfig[]): string {
    if (joinTables.length === 0) return "";

    return joinTables
      .map((join) => {
        const finalClause = join.table.useFinal ? " FINAL" : "";
        const alias = join.table.alias ? ` ${join.table.alias}` : "";
        return `${join.joinType} JOIN ${join.table.name}${finalClause}${alias} ON ${join.onCondition}`;
      })
      .join("\n");
  }

  private buildWhereClause(
    filters: FilterConfig[],
    projectId: string,
    representation: WidgetConfiguration,
  ): string {
    const conditions: string[] = [];

    // Add project filter with proper table alias
    const primaryTableAlias = this.getTableAlias(
      representation.primaryTable.name,
      representation,
    );

    // Only add project filter if projectId is provided
    if (projectId) {
      conditions.push(`${primaryTableAlias}."project_id" = {projectId:String}`);
    }

    // Add other filters
    filters.forEach((filter, index) => {
      const filterCondition = this.buildFilterCondition(
        filter,
        index,
        representation,
      );
      if (filterCondition) {
        conditions.push(filterCondition);
      }
    });

    return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  }

  private buildFilterCondition(
    filter: FilterConfig,
    index: number,
    representation: WidgetConfiguration,
  ): string | null {
    const columnExpression = this.getColumnExpression(
      filter.column.tableId,
      filter.column.columnId,
      representation,
    );
    if (!columnExpression) {
      console.warn(
        `Column definition not found for filter ${filter.column.tableId}.${filter.column.columnId}`,
      );
      return null;
    }

    const paramName = `filter_${index}`;

    // Handle different operators
    switch (filter.operator) {
      case "IN":
      case "NOT IN":
        return `${columnExpression} ${filter.operator} {${paramName}:Array(String)}`;
      case "BETWEEN":
        return `${columnExpression} BETWEEN {${paramName}_start:String} AND {${paramName}_end:String}`;
      case "LIKE":
      case "NOT LIKE":
        return `${columnExpression} ${filter.operator} {${paramName}:String}`;
      default:
        return `${columnExpression} ${filter.operator} {${paramName}:String}`;
    }
  }

  private buildGroupByClause(
    groupByColumns: GroupByConfig[],
    representation: WidgetConfiguration,
  ): string {
    if (groupByColumns.length === 0) return "";

    const groupColumns = groupByColumns
      .map((group) => {
        let columnExpression = this.getColumnExpression(
          group.column.tableId,
          group.column.columnId,
          representation,
        );
        if (!columnExpression) {
          console.warn(
            `Column definition not found for group by ${group.column.tableId}.${group.column.columnId}`,
          );
          return "";
        }

        // Apply time bucketing if specified
        if (group.bucketSize) {
          const bucketFunction = this.getTimeBucketFunction(group.bucketSize);
          columnExpression = `${bucketFunction}(${columnExpression})`;
        }

        return columnExpression;
      })
      .filter((col) => col.length > 0);

    return `GROUP BY ${groupColumns.join(", ")}`;
  }

  private buildOrderByClause(representation: WidgetConfiguration): string {
    if (representation.timeSeriesConfig) {
      const timeColumn = representation.timeSeriesConfig.timeColumn;
      const order = representation.timeSeriesConfig.orderBy;
      const fillClause = representation.timeSeriesConfig.fillGaps
        ? " WITH FILL"
        : "";
      return `ORDER BY ${timeColumn} ${order}${fillClause}`;
    }

    if (representation.orderBy && representation.orderBy.length > 0) {
      const orderClauses = representation.orderBy.map(
        (order) => `${order.column} ${order.direction}`,
      );
      return `ORDER BY ${orderClauses.join(", ")}`;
    }

    return "";
  }

  private buildLimitClause(limit?: number): string {
    return limit ? `LIMIT ${limit}` : "";
  }

  private buildTimeSeriesColumn(
    timeConfig: TimeSeriesConfig,
    representation: WidgetConfiguration,
  ): string {
    const bucketFunction = this.getTimeBucketFunction(timeConfig.bucketSize);

    // Find the table that contains the time column and build proper expression
    const timeTableId = this.findTimeColumnTable(
      timeConfig.timeColumn,
      representation,
    );
    const timeColumnExpression = this.getColumnExpression(
      timeTableId,
      "startTime",
      representation,
    );

    return `${bucketFunction}(${timeColumnExpression}) as ${timeConfig.timeColumn}`;
  }

  private findTimeColumnTable(
    timeColumn: string,
    representation: WidgetConfiguration,
  ): string {
    // For time series, typically use observations table for start_time
    if (timeColumn === "start_time") {
      return "observations";
    }

    // Default to primary table
    return representation.primaryTable.name;
  }

  private getTimeBucketFunction(bucketSize: string): string {
    const bucketMap: Record<string, string> = {
      minute: "toStartOfMinute",
      hour: "toStartOfHour",
      day: "toStartOfDay",
      week: "toStartOfWeek",
      month: "toStartOfMonth",
    };
    return bucketMap[bucketSize] || "toStartOfHour";
  }

  private buildParameters(
    filters: FilterConfig[],
    projectId: string,
  ): Record<string, any> {
    const parameters: Record<string, any> = {};

    // Add project ID parameter - this is crucial!
    if (projectId) {
      parameters.projectId = projectId;
    }

    // Add filter parameters
    filters.forEach((filter, index) => {
      const paramName = `filter_${index}`;

      if (filter.operator === "BETWEEN" && Array.isArray(filter.value)) {
        parameters[`${paramName}_start`] = filter.value[0];
        parameters[`${paramName}_end`] = filter.value[1];
      } else {
        parameters[paramName] = filter.value;
      }
    });

    return parameters;
  }

  private getColumnDefinition(tableId: string, columnId: string): any {
    const columnDef = this.columnRegistry.getColumn(tableId, columnId);
    if (!columnDef) {
      console.warn(`Column definition not found: ${tableId}.${columnId}`);
    }
    return columnDef;
  }

  private getTableAlias(
    tableId: string,
    representation: WidgetConfiguration,
  ): string {
    // Check primary table first
    if (representation.primaryTable.name === tableId) {
      return representation.primaryTable.alias || tableId.charAt(0);
    }

    // Check join tables
    const joinTable = representation.joinTables?.find(
      (join) => join.table.name === tableId,
    );
    if (joinTable) {
      return joinTable.table.alias || tableId.charAt(0);
    }

    // Fallback to first character of table name
    return tableId.charAt(0);
  }
}
