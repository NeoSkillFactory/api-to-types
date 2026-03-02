/**
 * type-utils.ts
 * Utility functions for converting JSON structures into TypeScript type definitions.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
export type JsonArray = JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface GeneratedType {
  name: string;
  definition: string;
}

export interface TypeGenerationOptions {
  /** Root interface/type name */
  rootName?: string;
  /** Add JSDoc comments based on field values */
  addJsDocs?: boolean;
  /** Use `type` alias instead of `interface` for objects */
  useTypeAlias?: boolean;
  /** Make all fields optional */
  allOptional?: boolean;
  /** Indent string (default: two spaces) */
  indent?: string;
}

/**
 * Infers the TypeScript primitive type string for a JSON primitive value.
 */
export function inferPrimitiveType(value: JsonPrimitive): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':  return 'string';
    case 'number':  return Number.isInteger(value) ? 'number' : 'number';
    case 'boolean': return 'boolean';
    default:        return 'unknown';
  }
}

/**
 * Converts a snake_case or kebab-case key into PascalCase.
 */
export function toPascalCase(key: string): string {
  return key
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
}

/**
 * Sanitizes a key to be a valid TypeScript identifier.
 * Wraps it in quotes if it contains special characters.
 */
export function sanitizeKey(key: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) return key;
  return JSON.stringify(key);
}

/**
 * Merges multiple TypeScript type strings into a union type.
 * Deduplicates and sorts the members for stable output.
 */
export function mergeTypes(types: string[]): string {
  const unique = [...new Set(types)].sort();
  if (unique.length === 1) return unique[0];
  return unique.join(' | ');
}

/**
 * Infers the TypeScript type for any JSON value.
 * Collects nested interface definitions into `collector`.
 */
export function inferType(
  value: JsonValue,
  keyName: string,
  collector: Map<string, string>,
  opts: TypeGenerationOptions
): string {
  if (value === null) return 'null';

  if (Array.isArray(value)) {
    return inferArrayType(value, keyName, collector, opts);
  }

  if (typeof value === 'object') {
    return inferObjectType(value as JsonObject, keyName, collector, opts);
  }

  return inferPrimitiveType(value as JsonPrimitive);
}

/**
 * Infers the element type of a JSON array.
 * Unions together the types of all elements.
 */
function inferArrayType(
  arr: JsonArray,
  keyName: string,
  collector: Map<string, string>,
  opts: TypeGenerationOptions
): string {
  if (arr.length === 0) return 'unknown[]';

  const elementTypes = arr.map((item, i) =>
    inferType(item, `${keyName}Item`, collector, opts)
  );
  const merged = mergeTypes(elementTypes);
  // Wrap union in parens if needed
  return merged.includes(' | ') ? `(${merged})[]` : `${merged}[]`;
}

/**
 * Infers a TypeScript interface/type from a JSON object.
 * Registers the nested interface in `collector`.
 */
function inferObjectType(
  obj: JsonObject,
  keyName: string,
  collector: Map<string, string>,
  opts: TypeGenerationOptions
): string {
  const interfaceName = toPascalCase(keyName);
  const definition = buildObjectDefinition(obj, interfaceName, collector, opts);
  collector.set(interfaceName, definition);
  return interfaceName;
}

/**
 * Builds the full interface/type definition string for an object.
 */
export function buildObjectDefinition(
  obj: JsonObject,
  name: string,
  collector: Map<string, string>,
  opts: TypeGenerationOptions
): string {
  const indent = opts.indent ?? '  ';
  const optional = opts.allOptional ? '?' : '';
  const keyword = opts.useTypeAlias ? 'type' : 'interface';
  const lines: string[] = [];

  if (keyword === 'interface') {
    lines.push(`export interface ${name} {`);
  } else {
    lines.push(`export type ${name} = {`);
  }

  for (const [key, val] of Object.entries(obj)) {
    const fieldType = inferType(val, toPascalCase(key), collector, opts);
    const safeKey = sanitizeKey(key);

    if (opts.addJsDocs && val !== null && typeof val !== 'object' && !Array.isArray(val)) {
      lines.push(`${indent}/** Example: ${JSON.stringify(val)} */`);
    }
    lines.push(`${indent}${safeKey}${optional}: ${fieldType};`);
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Generates all TypeScript type definitions from a parsed JSON value.
 * Returns an ordered list of `GeneratedType` objects (dependencies first).
 */
export function generateTypes(
  json: JsonValue,
  opts: TypeGenerationOptions = {}
): GeneratedType[] {
  const rootName = opts.rootName ?? 'ApiResponse';
  const collector = new Map<string, string>();

  // Determine the root type expression
  let rootType: string;
  if (Array.isArray(json)) {
    if (json.length === 0) {
      rootType = 'unknown[]';
    } else {
      const elementTypes = json.map((item) =>
        inferType(item, `${rootName}Item`, collector, opts)
      );
      const merged = mergeTypes(elementTypes);
      rootType = merged.includes(' | ') ? `(${merged})[]` : `${merged}[]`;
    }
    // Create a type alias for the root array
    collector.set(rootName, `export type ${rootName} = ${rootType};`);
  } else if (json !== null && typeof json === 'object') {
    inferObjectType(json as JsonObject, rootName, collector, opts);
  } else {
    collector.set(rootName, `export type ${rootName} = ${inferPrimitiveType(json as JsonPrimitive)};`);
  }

  // Return in insertion order (dependencies were added first via recursion)
  const result: GeneratedType[] = [];
  for (const [name, definition] of collector) {
    result.push({ name, definition });
  }
  return result;
}

/**
 * Formats an array of GeneratedType objects into a final TypeScript source string.
 */
export function formatOutput(types: GeneratedType[], header = true): string {
  const parts: string[] = [];

  if (header) {
    parts.push('// Auto-generated by api-to-types');
    parts.push(`// Generated at: ${new Date().toISOString()}`);
    parts.push('');
  }

  for (const t of types) {
    parts.push(t.definition);
    parts.push('');
  }

  return parts.join('\n').trimEnd() + '\n';
}
