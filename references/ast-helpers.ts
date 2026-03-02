/**
 * ast-helpers.ts
 * TypeScript AST manipulation helpers for type validation and schema checking.
 *
 * This module provides utilities for:
 *   - Parsing TypeScript interface definitions from source text
 *   - Extracting field names and types from parsed interfaces
 *   - Validating a JSON value against a parsed TypeScript interface
 *   - Computing structural diffs between two interfaces
 */

/** A single field extracted from a TypeScript interface definition. */
export interface InterfaceField {
  name: string;
  type: string;
  optional: boolean;
}

/** A parsed representation of a TypeScript interface or type alias. */
export interface ParsedInterface {
  name: string;
  fields: InterfaceField[];
  isTypeAlias: boolean;
}

/** Result of validating a JSON value against a parsed interface. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  expected: string;
  actual: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

/** Result of diffing two parsed interfaces. */
export interface InterfaceDiff {
  added: InterfaceField[];    // Fields in `next` but not `prev`
  removed: InterfaceField[];  // Fields in `prev` but not `next`
  changed: Array<{ prev: InterfaceField; next: InterfaceField }>;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Extracts all interface and type-alias definitions from a TypeScript source string.
 * Uses regex-based parsing (no external TypeScript compiler required).
 */
export function parseInterfaces(source: string): ParsedInterface[] {
  const results: ParsedInterface[] = [];

  // Match `export interface Foo {` or `export type Foo = {`
  const interfaceRegex = /export\s+(interface|type)\s+(\w+)\s*(?:=\s*)?\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = interfaceRegex.exec(source)) !== null) {
    const keyword = match[1];
    const name = match[2];
    const body = match[3];
    const isTypeAlias = keyword === 'type';
    const fields = parseFields(body);
    results.push({ name, fields, isTypeAlias });
  }

  return results;
}

/**
 * Parses the body of an interface definition into an array of `InterfaceField` objects.
 */
function parseFields(body: string): InterfaceField[] {
  const fields: InterfaceField[] = [];
  // Match lines like:   fieldName?: SomeType;   or   "field-name": string;
  const fieldRegex = /^\s*(["']?[\w$-]+["']?)\s*(\?)?\s*:\s*([^;]+);/gm;
  let m: RegExpExecArray | null;

  while ((m = fieldRegex.exec(body)) !== null) {
    const rawName = m[1].replace(/['"]/g, '');
    const optional = m[2] === '?';
    const type = m[3].trim();
    fields.push({ name: rawName, type, optional });
  }

  return fields;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates a JSON value against a ParsedInterface.
 * Checks that all required fields are present and have compatible types.
 */
export function validateAgainstInterface(
  json: Record<string, unknown>,
  iface: ParsedInterface
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  for (const field of iface.fields) {
    const value = json[field.name];

    if (value === undefined) {
      if (!field.optional) {
        errors.push({
          field: field.name,
          expected: field.type,
          actual: 'undefined',
          message: `Required field "${field.name}" is missing`,
        });
      }
      continue;
    }

    const actualType = getJsonType(value);
    if (!isTypeCompatible(actualType, field.type)) {
      errors.push({
        field: field.name,
        expected: field.type,
        actual: actualType,
        message: `Field "${field.name}" expected type "${field.type}" but got "${actualType}"`,
      });
    }
  }

  // Warn about extra fields not present in the interface
  for (const key of Object.keys(json)) {
    if (!iface.fields.find((f) => f.name === key)) {
      warnings.push({
        field: key,
        message: `Field "${key}" is present in the response but not in the generated interface`,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Returns a TypeScript-like type label for a JSON runtime value.
 */
export function getJsonType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    const elementTypes = [...new Set(value.map(getJsonType))];
    const inner = elementTypes.length === 1 ? elementTypes[0] : elementTypes.join(' | ');
    return inner.includes(' | ') ? `(${inner})[]` : `${inner}[]`;
  }
  switch (typeof value) {
    case 'string':  return 'string';
    case 'number':  return 'number';
    case 'boolean': return 'boolean';
    case 'object':  return 'object';
    default:        return 'unknown';
  }
}

/**
 * Checks whether an actual runtime type is compatible with the declared TypeScript type.
 * This is a best-effort structural check — it handles common primitive and union types.
 */
export function isTypeCompatible(actual: string, declared: string): boolean {
  const normalized = declared.replace(/\s+/g, ' ').trim();

  // Direct match
  if (actual === normalized) return true;

  // null compatibility
  if (actual === 'null' && normalized.includes('null')) return true;

  // Union type — check if actual matches any member
  if (normalized.includes(' | ')) {
    return normalized.split(' | ').some((member) =>
      isTypeCompatible(actual, member.trim())
    );
  }

  // Arrays
  if (actual.endsWith('[]') && normalized.endsWith('[]')) return true;
  if (actual.endsWith('[]') && normalized === 'unknown[]') return true;

  // Object/interface (named types)
  if (actual === 'object' && /^[A-Z]\w*$/.test(normalized)) return true;

  // unknown catches everything
  if (normalized === 'unknown') return true;

  return false;
}

// ─── Diffing ─────────────────────────────────────────────────────────────────

/**
 * Computes the structural diff between two parsed interfaces.
 */
export function diffInterfaces(
  prev: ParsedInterface,
  next: ParsedInterface
): InterfaceDiff {
  const prevMap = new Map(prev.fields.map((f) => [f.name, f]));
  const nextMap = new Map(next.fields.map((f) => [f.name, f]));

  const added: InterfaceField[] = [];
  const removed: InterfaceField[] = [];
  const changed: Array<{ prev: InterfaceField; next: InterfaceField }> = [];

  for (const [name, nextField] of nextMap) {
    if (!prevMap.has(name)) {
      added.push(nextField);
    } else {
      const prevField = prevMap.get(name)!;
      if (prevField.type !== nextField.type || prevField.optional !== nextField.optional) {
        changed.push({ prev: prevField, next: nextField });
      }
    }
  }

  for (const [name, prevField] of prevMap) {
    if (!nextMap.has(name)) {
      removed.push(prevField);
    }
  }

  return { added, removed, changed };
}

/**
 * Formats a validation result as human-readable text.
 */
export function formatValidationResult(result: ValidationResult, interfaceName: string): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push(`✓ Interface "${interfaceName}" is valid against the API response.`);
  } else {
    lines.push(`✗ Interface "${interfaceName}" has ${result.errors.length} validation error(s).`);
    for (const err of result.errors) {
      lines.push(`  ERROR  ${err.field}: ${err.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`  ${result.warnings.length} warning(s):`);
    for (const w of result.warnings) {
      lines.push(`  WARN   ${w.field}: ${w.message}`);
    }
  }

  return lines.join('\n');
}
