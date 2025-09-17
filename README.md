# Telegram Logo Generator Bot - Context Boundary System

This repository contains a set of tools to maintain context boundaries during AI-assisted development of the Telegram Logo Generator Bot. The system helps ensure that both AI assistants and developers maintain consistency with the project's defined scope, architecture, and technology stack.

## Purpose

When working on a project with AI assistance over extended periods, there's a risk of "context drift" - where suggestions gradually move away from the original scope and architecture. The Context Boundary System addresses this issue by:

1. Establishing clear project rules in a human-readable format (`cursor-rule.md`)
2. Implementing programmatic validation of these rules (`ai-context-rules.ts`)
3. Providing runtime middleware to enforce context boundaries (`context-middleware.ts`)
4. Demonstrating integration with the bot code (`bot-usage-example.ts`)

## Components

### 1. Cursor Rule Document (`cursor-rule.md`)

The human-readable definition of project boundaries, containing:
- Project scope and technology stack specifications
- Development standards and coding conventions
- Context constraints for AI assistants
- Feature boundaries and limitations
- References to the implementation guide

This document should be reviewed and updated as the project evolves.

### 2. Context Rules TypeScript (`ai-context-rules.ts`)

A programmatic representation of the cursor rules with:
- Interfaces defining project boundaries and development standards
- Constants mapping allowed technologies, features, architecture patterns
- Validation functions to check if code and solutions adhere to boundaries
- Helper utilities for checking code standards

### 3. Context Middleware (`context-middleware.ts`)

Runtime enforcement of context boundaries through:
- Telegram middleware that analyzes user requests
- Detection of potential scope/context violations
- Logging system for tracking and reviewing violations
- Response handling for redirecting out-of-scope requests

### 4. Bot Usage Example (`bot-usage-example.ts`)

Example implementation showing:
- How to properly integrate the context middleware
- Basic bot setup following the architecture in the implementation guide
- Scene-based flow as specified in project requirements

## How to Use

### For AI Assistants

1. Always refer to the `cursor-rule.md` document when making suggestions
2. Run validation against `ai-context-rules.ts` when generating new code
3. Stay within the defined technology stack and feature boundaries
4. Follow the architecture patterns specified in the implementation guide

### For Developers

1. Install dependencies:
   ```bash
   npm install telegraf ioredis openai dotenv aws-sdk
   npm install --save-dev typescript ts-node-dev @types/node
   ```

2. Configure TypeScript:
   ```bash
   npx tsc --init
   ```

3. Apply the middleware in your bot setup:
   ```typescript
   import { createContextBoundaryMiddleware } from './context-middleware';
   // ...
   bot.use(createContextBoundaryMiddleware());
   ```

4. Monitor the generated log file (`context-violations.log`) for potential issues

## Benefits

Using this system provides:
- Consistent code quality and architecture
- Prevention of feature creep and scope drift
- Improved collaboration between human developers and AI assistants
- Clear documentation of project boundaries for new team members
- Runtime protection against out-of-context user requests

## Next Steps

As development progresses:
1. Regularly update the cursor rules as requirements evolve
2. Expand the automatic validation with more specific checks
3. Improve the context analysis with more advanced pattern recognition
4. Add unit tests for the validation functions # Trigger rebuild - Wed Sep 17 08:42:24 PDT 2025
