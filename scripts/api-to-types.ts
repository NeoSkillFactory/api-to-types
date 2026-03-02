#!/usr/bin/env node
/**
 * api-to-types.ts
 * Generates TypeScript types from REST API responses and optionally validates
 * them against actual API endpoints.
 *
 * Usage:
 *   node api-to-types.js --url <endpoint>       Fetch live endpoint and generate types
 *   node api-to-types.js --input-json '<json>'   Generate types from inline JSON
 *   cat response.json | node api-to-types.js     Generate types from stdin
 *
 * Options:
 *   --url, -u         API endpoint URL
 *   --name, -n        Root type name (default: derived from URL or "ApiResponse")
 *   --method, -m      HTTP method (default: GET)
 *   --headers, -H     JSON string of additional request headers
 *   --output, -o      Output file path (default: stdout)
 *   --validate        Validate generated types against the live endpoint response
 *   --optional        Make all generated fields optional
 *   --type-alias      Use "type" instead of "interface" for object definitions
 *   --no-jsdoc        Suppress inline JSDoc comments
 *   --no-header       Suppress the auto-generated file header comment
 *   --input-json      Accept JSON directly as a CLI argument
 *   --help, -h        Show this help text
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

// ─── Inline implementations of type-utils logic ──────────────────────────────
// (Reproduced here so the compiled .js can run without separate module resolution)

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonArray | JsonObject;
type JsonArray = JsonValue[];
interface JsonObject { [key: string]: JsonValue; }

interface GeneratedType { name: string; definition: string; }
interface TypeGenerationOptions {
  rootName?: string;
  addJsDocs?: boolean;
  useTypeAlias?: boolean;
  allOptional?: boolean;
  indent?: string;
}

function inferPrimitiveType(value: JsonPrimitive): string {
  if (value === null) return 'null';
  return typeof value as string;
}

function toPascalCase(key: string): string {
  return key
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
}

function sanitizeKey(key: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function mergeTypes(types: string[]): string {
  const unique = [...new Set(types)].sort();
  return unique.length === 1 ? unique[0] : unique.join(' | ');
}

function inferType(
  value: JsonValue,
  keyName: string,
  collector: Map<string, string>,
  opts: TypeGenerationOptions
): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    const elementTypes = value.map(() => inferType(value[0], `${keyName}Item`, collector, opts));
    const merged = mergeTypes(elementTypes);
    return merged.includes(' | ') ? `(${merged})[]` : `${merged}[]`;
  }
  if (typeof value === 'object') {
    const interfaceName = toPascalCase(keyName);
    const definition = buildObjectDefinition(value as JsonObject, interfaceName, collector, opts);
    collector.set(interfaceName, definition);
    return interfaceName;
  }
  return inferPrimitiveType(value as JsonPrimitive);
}

function buildObjectDefinition(
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

function generateTypes(json: JsonValue, opts: TypeGenerationOptions = {}): GeneratedType[] {
  const rootName = opts.rootName ?? 'ApiResponse';
  const collector = new Map<string, string>();

  if (Array.isArray(json)) {
    if (json.length === 0) {
      collector.set(rootName, `export type ${rootName} = unknown[];`);
    } else {
      const elementTypes = json.map((item) =>
        inferType(item, `${rootName}Item`, collector, opts)
      );
      const merged = mergeTypes(elementTypes);
      const rootType = merged.includes(' | ') ? `(${merged})[]` : `${merged}[]`;
      collector.set(rootName, `export type ${rootName} = ${rootType};`);
    }
  } else if (json !== null && typeof json === 'object') {
    inferType(json, rootName, collector, opts);
  } else {
    collector.set(rootName, `export type ${rootName} = ${inferPrimitiveType(json as JsonPrimitive)};`);
  }

  const result: GeneratedType[] = [];
  for (const [name, definition] of collector) {
    result.push({ name, definition });
  }
  return result;
}

function formatOutput(types: GeneratedType[], header = true): string {
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

// ─── Inline implementations of ast-helpers validation logic ──────────────────

interface InterfaceField { name: string; type: string; optional: boolean; }
interface ParsedInterface { name: string; fields: InterfaceField[]; isTypeAlias: boolean; }
interface ValidationResult { valid: boolean; errors: ValidationError[]; warnings: ValidationWarning[]; }
interface ValidationError { field: string; expected: string; actual: string; message: string; }
interface ValidationWarning { field: string; message: string; }

function parseInterfaces(source: string): ParsedInterface[] {
  const results: ParsedInterface[] = [];
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

function parseFields(body: string): InterfaceField[] {
  const fields: InterfaceField[] = [];
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

function getJsonType(value: unknown): string {
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

function isTypeCompatible(actual: string, declared: string): boolean {
  const normalized = declared.replace(/\s+/g, ' ').trim();
  if (actual === normalized) return true;
  if (actual === 'null' && normalized.includes('null')) return true;
  if (normalized.includes(' | ')) {
    return normalized.split(' | ').some((m) => isTypeCompatible(actual, m.trim()));
  }
  if (actual.endsWith('[]') && normalized.endsWith('[]')) return true;
  if (actual === 'object' && /^[A-Z]\w*$/.test(normalized)) return true;
  if (normalized === 'unknown') return true;
  return false;
}

function validateAgainstInterface(
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
          field: field.name, expected: field.type, actual: 'undefined',
          message: `Required field "${field.name}" is missing`,
        });
      }
      continue;
    }
    const actualType = getJsonType(value);
    if (!isTypeCompatible(actualType, field.type)) {
      errors.push({
        field: field.name, expected: field.type, actual: actualType,
        message: `Field "${field.name}" expected "${field.type}" but got "${actualType}"`,
      });
    }
  }

  for (const key of Object.keys(json)) {
    if (!iface.fields.find((f) => f.name === key)) {
      warnings.push({ field: key, message: `Field "${key}" present in response but not in interface` });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── HTTP fetch helper ────────────────────────────────────────────────────────

interface FetchOptions {
  method: string;
  headers: Record<string, string>;
  timeout?: number;
}

function fetchUrl(url: string, opts: FetchOptions): Promise<{ body: string; statusCode: number; contentType: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method,
      headers: { 'Accept': 'application/json', ...opts.headers },
      timeout: opts.timeout ?? 15000,
    };

    const req = transport.request(reqOpts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        resolve({
          body: Buffer.concat(chunks).toString('utf8'),
          statusCode: res.statusCode ?? 0,
          contentType: res.headers['content-type'] ?? '',
        });
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error(`Request timed out after ${opts.timeout}ms`)); });
    req.on('error', reject);
    req.end();
  });
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function showHelp(): void {
  console.log(`
api-to-types — Generate TypeScript types from REST API responses

USAGE
  node api-to-types.js [options]

OPTIONS
  --url, -u <url>         API endpoint URL to fetch
  --input-json <json>     Inline JSON string to convert
  --name, -n <name>       Root type name (default: derived from URL or "ApiResponse")
  --method, -m <method>   HTTP method (default: GET)
  --headers, -H <json>    JSON object of additional request headers
  --output, -o <file>     Write generated types to this file (default: stdout)
  --validate              Validate generated types against the live endpoint
  --optional              Make all generated fields optional
  --type-alias            Use "type" instead of "interface" for objects
  --no-jsdoc              Suppress inline JSDoc comments
  --no-header             Suppress the "Auto-generated" file header comment
  --help, -h              Show this help text

EXAMPLES
  # From a live endpoint
  node api-to-types.js --url https://jsonplaceholder.typicode.com/todos/1

  # With a custom type name and output file
  node api-to-types.js --url https://api.example.com/users --name User --output types.ts

  # From inline JSON
  node api-to-types.js --input-json '{"id":1,"name":"Alice"}' --name Person

  # From stdin
  cat response.json | node api-to-types.js --name MyType

  # Validate against the live endpoint
  node api-to-types.js --url https://api.example.com/items --validate
`);
}

interface CliArgs {
  url?: string;
  inputJson?: string;
  name?: string;
  method: string;
  headers: Record<string, string>;
  output?: string;
  validate: boolean;
  optional: boolean;
  typeAlias: boolean;
  jsDoc: boolean;
  header: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    method: 'GET',
    headers: {},
    validate: false,
    optional: false,
    typeAlias: false,
    jsDoc: true,
    header: true,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--help': case '-h':      args.help = true; break;
      case '--validate':             args.validate = true; break;
      case '--optional':             args.optional = true; break;
      case '--type-alias':           args.typeAlias = true; break;
      case '--no-jsdoc':             args.jsDoc = false; break;
      case '--no-header':            args.header = false; break;
      case '--url':    case '-u':    args.url = next; i++; break;
      case '--name':   case '-n':    args.name = next; i++; break;
      case '--method': case '-m':    args.method = next.toUpperCase(); i++; break;
      case '--output': case '-o':    args.output = next; i++; break;
      case '--input-json':           args.inputJson = next; i++; break;
      case '--headers': case '-H': {
        try { args.headers = JSON.parse(next); } catch { die(`--headers must be valid JSON: ${next}`); }
        i++;
        break;
      }
    }
  }

  return args;
}

function die(msg: string, code = 1): never {
  console.error(`[api-to-types] ERROR: ${msg}`);
  process.exit(code);
}

function deriveTypeName(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return 'ApiResponse';
    // Use the last non-numeric segment
    const seg = [...segments].reverse().find((s) => !/^\d+$/.test(s));
    if (!seg) return 'ApiResponse';
    return toPascalCase(seg.replace(/s$/, '')); // naive singularise
  } catch {
    return 'ApiResponse';
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c: Buffer) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8').trim()));
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  let rawJson: string;

  if (args.inputJson) {
    rawJson = args.inputJson;
  } else if (args.url) {
    process.stderr.write(`[api-to-types] Fetching ${args.method} ${args.url}\n`);
    let resp: { body: string; statusCode: number; contentType: string };
    try {
      resp = await fetchUrl(args.url, { method: args.method, headers: args.headers });
    } catch (err: unknown) {
      die(`Network error: ${(err as Error).message}`);
    }
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      die(`HTTP ${resp.statusCode} from ${args.url}`);
    }
    rawJson = resp.body;
  } else {
    rawJson = await readStdin();
    if (!rawJson) {
      console.error('[api-to-types] No input provided. Use --url, --input-json, or pipe JSON via stdin.');
      showHelp();
      process.exit(1);
    }
  }

  let parsed: JsonValue;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    die(`Failed to parse JSON: ${rawJson.slice(0, 200)}`);
  }

  const rootName = args.name ?? (args.url ? deriveTypeName(args.url) : 'ApiResponse');

  const opts: TypeGenerationOptions = {
    rootName,
    addJsDocs: args.jsDoc,
    useTypeAlias: args.typeAlias,
    allOptional: args.optional,
  };

  const types = generateTypes(parsed!, opts);
  const output = formatOutput(types, args.header);

  // Write output
  if (args.output) {
    const outPath = path.resolve(args.output);
    fs.writeFileSync(outPath, output, 'utf8');
    process.stderr.write(`[api-to-types] Types written to ${outPath}\n`);
  } else {
    process.stdout.write(output);
  }

  // Validation
  if (args.validate && args.url) {
    process.stderr.write(`\n[api-to-types] Validating types against ${args.url}\n`);

    let validationJson: Record<string, unknown>;
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        process.stderr.write('[api-to-types] WARN: Empty array response — nothing to validate.\n');
        process.exit(0);
      }
      validationJson = parsed[0] as Record<string, unknown>;
    } else if (parsed !== null && typeof parsed === 'object') {
      validationJson = parsed as Record<string, unknown>;
    } else {
      process.stderr.write('[api-to-types] WARN: Primitive response — skipping structural validation.\n');
      process.exit(0);
    }

    const interfaces = parseInterfaces(output);
    if (interfaces.length === 0) {
      process.stderr.write('[api-to-types] WARN: No interfaces found in output to validate.\n');
      process.exit(0);
    }

    // Validate the root interface
    const rootIface = interfaces.find((i) => i.name === rootName) ?? interfaces[interfaces.length - 1];
    const result = validateAgainstInterface(validationJson, rootIface);

    if (result.valid) {
      process.stderr.write(`[api-to-types] ✓ Interface "${rootIface.name}" validated successfully.\n`);
      if (result.warnings.length > 0) {
        for (const w of result.warnings) {
          process.stderr.write(`[api-to-types] WARN: ${w.message}\n`);
        }
      }
    } else {
      process.stderr.write(`[api-to-types] ✗ Validation failed for "${rootIface.name}":\n`);
      for (const e of result.errors) {
        process.stderr.write(`  ERROR: ${e.message}\n`);
      }
      for (const w of result.warnings) {
        process.stderr.write(`  WARN:  ${w.message}\n`);
      }
      process.exit(1);
    }
  }
}

main().catch((err: unknown) => {
  console.error('[api-to-types] Unhandled error:', (err as Error).message ?? err);
  process.exit(1);
});
