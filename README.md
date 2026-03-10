# api-to-types

![Audit](https://img.shields.io/badge/audit%3A%20PASS-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue) ![OpenClaw](https://img.shields.io/badge/OpenClaw-skill-orange)

> Automatically generates TypeScript types from REST API responses with validation against actual endpoints.

## Features

- Generate TypeScript interfaces from HTTP response JSON
- Validate generated types against actual API endpoints
- Provide clean CLI interface for direct use and automation
- Integrate naturally with agent workflows via command execution
- Handle errors gracefully with non-zero exit codes on validation failures
- Support various HTTP methods and response formats (JSON, arrays, nested objects)
- Generate type definitions with proper JSDoc comments and type annotations

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

## GitHub

Source code: [github.com/NeoSkillFactory/api-to-types](https://github.com/NeoSkillFactory/api-to-types)

## License

MIT © NeoSkillFactory