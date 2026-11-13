import {
  OperationNodeTransformer,
  PrimitiveValueListNode,
  ValueNode,
  type KyselyPlugin,
  type QueryResult,
  type RootOperationNode,
  type UnknownRow,
} from "kysely";

// Better Auth's Kysely adapter always sets `supportsArrays: false`, so it
// JSON-encodes `string[]` fields. Inserts put that text in a
// PrimitiveValueListNode. The schema stores those fields as `text[]`, and
// Postgres rejects a JSON array literal. Turn that JSON text back into an
// array before the parameter is bound. Real arrays and other JSON values are
// left alone.
export function restorePostgresArray(value: unknown): unknown {
  if (
    typeof value !== "string" ||
    !value.startsWith("[") ||
    !value.endsWith("]")
  ) {
    return value;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every(isScalarArrayItem)) {
      return value;
    }
    return parsed;
  } catch {
    return value;
  }
}

function isScalarArrayItem(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

class PostgresTextArrayTransformer extends OperationNodeTransformer {
  protected override transformValue(node: ValueNode): ValueNode {
    const value = restorePostgresArray(node.value);
    return value === node.value ? node : ValueNode.create(value);
  }

  protected override transformPrimitiveValueList(
    node: PrimitiveValueListNode,
  ): PrimitiveValueListNode {
    let changed = false;
    const values = node.values.map((value) => {
      const restored = restorePostgresArray(value);
      if (restored !== value) changed = true;
      return restored;
    });
    return changed ? { ...node, values } : node;
  }
}

export const postgresTextArrayPlugin: KyselyPlugin = {
  transformQuery({ node }): RootOperationNode {
    return new PostgresTextArrayTransformer().transformNode(node);
  },
  transformResult({ result }): Promise<QueryResult<UnknownRow>> {
    return Promise.resolve(result);
  },
};
