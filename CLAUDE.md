# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Security Rules

**NEVER commit API keys, tokens, or secrets to git.** When handling credentials:
- Use `supabase secrets set KEY=value` for Edge Function secrets
- Use `.env` files (already in `.gitignore`) for local development
- Never echo/print keys in terminal output that gets logged
- If a user provides a key, store it securely without exposing it in commit messages or file contents that get tracked

## Project Overview

ShiftSnap is a React Native + Expo mobile app that uses AI (Google Gemini 2.0 Flash Vision) to convert paper shift schedules into digital calendar events. Built as a pnpm monorepo with Supabase backend.

## Commands

```bash
# Development
pnpm mobile:start       # Start Expo dev server
pnpm mobile:ios         # Run on iOS simulator
pnpm mobile:android     # Run on Android emulator

# Database
pnpm supabase:start     # Start local Supabase
pnpm supabase:stop      # Stop local Supabase
pnpm supabase:migrate   # Push database migrations
pnpm supabase:generate-types  # Generate TypeScript types from schema

# Quality
pnpm lint               # Lint all packages
pnpm typecheck          # TypeScript check all packages
pnpm clean              # Clean build artifacts
```

## Architecture

### Monorepo Structure
- `apps/mobile/` - Expo + React Native app with Expo Router (file-based routing in `app/` directory)
- `packages/shared/` - Shared types, constants, and utilities (imported as `@shiftsnap/shared`)
- `supabase/` - Database migrations, Edge Functions, and config

### State Management
- **Zustand** for global state (`src/stores/authStore.ts`)
- Auth store handles user sessions with Supabase + expo-secure-store persistence

### Type System
All TypeScript types live in `/packages/shared/src/types/index.ts`:
- User, Person, Schedule, Shift, ShiftCode
- OCRResult, OCRRow, OCRShift, CalendarEvent
- ScheduleSharing, Group, GroupMember

### Database
PostgreSQL via Supabase with Row-Level Security (RLS) on all tables. Key entities:
- `users` - Auth users with profiles
- `persons` - Multi-person schedule tracking per account
- `schedules` - Uploaded schedule images with OCR results
- `shifts` - Individual extracted shifts
- `shift_codes` - User-defined shift code mappings
- `schedule_sharing` / `groups` / `group_members` - Collaborative features

### OCR Processing
Edge Function at `/supabase/functions/ocr-process/index.ts` (Deno runtime) calls Gemini API with structured prompting to extract shift data from images.

### Theme System
Light/dark mode via `useTheme()` hook from `/apps/mobile/src/theme/index.ts`. Colors and design tokens in `/packages/shared/src/constants/`.

## Path Aliases
- `@/` → `apps/mobile/src/`
- `@shiftsnap/shared` → `packages/shared/src/`

## Key Patterns
- TypeScript strict mode enforced
- Database changes require: migration file → `pnpm supabase:migrate` → `pnpm supabase:generate-types`
- UI components in `/apps/mobile/src/components/ui/` (Card, Button, Input)
- Auth flow: Supabase Auth (email/Google/Apple) with secure token storage
