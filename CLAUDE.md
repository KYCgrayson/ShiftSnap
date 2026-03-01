# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Security Rules

**所有 API key、密鑰、個人憑證或敏感資訊都不應該出現在任何公開可見的地方。** 這包括但不限於：commit message、公開的 Git 儲存庫、公開的 issue/PR、終端機輸出日誌，或其他任何會被第三方看到的記錄。

**儲存方式：**
- 使用 `.env` 檔案儲存環境變數（已加入 `.gitignore`，不納入版本控制）
- 使用 `supabase secrets set KEY=value` 管理 Edge Function 密鑰
- 使用 CI/CD secrets、Supabase/Firebase/GCP/AWS secrets 等安全的密鑰管理服務
- 如果使用者提供密鑰，存放於安全位置，不得出現在被追蹤的檔案或 commit 記錄中

**需從外部注入的環境變數：**
| 變數名稱 | 用途 | 設定位置 |
|---------|------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 專案 URL | `apps/mobile/.env` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名金鑰 | `apps/mobile/.env` |
| `GEMINI_API_KEY` | Google Gemini Vision API 金鑰 | `supabase secrets set` |
| Apple OAuth (Services ID, Secret Key) | Apple Sign In | Supabase Dashboard → Auth → Providers |
| Google OAuth (Client ID, Client Secret) | Google Sign In | Supabase Dashboard → Auth → Providers |

## Project Overview

ShiftSnap is a React Native + Expo mobile app that uses AI (Google Gemini 2.0 Flash Vision) to convert paper shift schedules into digital calendar events. Built as a pnpm monorepo with Supabase backend.

## Commands

```bash
# Development (preferred — run from apps/mobile/)
cd apps/mobile
npx expo start            # Start Expo dev server
npx expo start --ios      # Start and open iOS simulator
npx expo start --android  # Start and open Android emulator

# Development (pnpm workspace aliases — run from repo root)
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
