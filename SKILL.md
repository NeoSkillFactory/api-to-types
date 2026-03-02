---
name: api-to-types
description: Automatically generates TypeScript types from REST API responses with validation against actual endpoints.
---

# api-to-types

Automatically generates TypeScript types from REST API responses and validates them against actual endpoints.

## Capabilities

- Generate TypeScript interfaces from HTTP response JSON
- Validate generated types against actual API endpoints
- Provide clean CLI interface for direct use and automation
- Integrate naturally with agent workflows via command execution
- Handle errors gracefully with non-zero exit codes on validation failures
- Support various HTTP methods and response formats (JSON, arrays, nested objects)
- Generate type definitions with proper JSDoc comments and type annotations

## Out of Scope

- Generate API client code or HTTP request logic beyond types
- Handle GraphQL schema type generation
- Provide runtime validation or serialization logic
- Support OpenAPI/Swagger specification processing
- Generate mock data, test fixtures, or example implementations
- Handle WebSocket or real-time API type generation
- Provide IDE plugin integration or editor extensions

## Trigger Scenarios

- "Generate TypeScript types from this API response"
- "Create types for this REST API endpoint"
- "Auto-generate TS types from this JSON response"
- "Build TypeScript interface from this API response"
- "Generate types for this API and validate against endpoint"
- "Convert this JSON response to TypeScript types"
- "Create type definitions for this REST API"
- "Generate TypeScript interfaces from API"

## Required Resources

- scripts/api-to-types.js: Main executable for type generation and validation
- references/type-utils.ts: Utility functions for TypeScript type generation
- references/ast-helpers.ts: TypeScript AST manipulation helpers

## Key Files

- `SKILL.md`: This file — skill metadata and documentation
- `scripts/api-to-types.ts`: TypeScript source for type generation and validation
- `scripts/api-to-types.js`: Compiled JavaScript executable
- `references/type-utils.ts`: Type generation utility functions
- `references/ast-helpers.ts`: TypeScript AST manipulation helpers
- `package.json`: NPM package configuration
- `README.md`: User documentation with examples

## Acceptance Criteria

- Successfully generates TypeScript types from sample API responses with proper typing
- Validates generated types against actual API endpoints and reports discrepancies
- Provides working CLI interface with help text, error handling, and exit codes
- Integrates with OpenClaw agent workflows via exec command execution
- Handles various response formats including arrays, nested objects, and edge cases
- Complete documentation with installation instructions and usage examples
- Package installs correctly and runs without dependency conflicts
- Handles error cases gracefully with meaningful error messages

## Usage

```bash
# Generate types from a live API endpoint
node scripts/api-to-types.js --url https://jsonplaceholder.typicode.com/todos/1

# Generate with a custom type name
node scripts/api-to-types.js --url https://api.example.com/users --name User

# Generate from a specific HTTP method
node scripts/api-to-types.js --url https://api.example.com/data --method GET

# Validate types against the actual endpoint response
node scripts/api-to-types.js --url https://api.example.com/items --validate

# Save generated types to a file
node scripts/api-to-types.js --url https://api.example.com/products --output types.ts

# Pipe JSON directly
echo '{"id":1,"name":"Alice"}' | node scripts/api-to-types.js --name Person

# Use with custom headers (e.g., authorization)
node scripts/api-to-types.js --url https://api.example.com/secure --headers '{"Authorization":"Bearer token123"}'
```
