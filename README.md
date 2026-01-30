# ShiftSnap

AI-Powered Shift Schedule Recognition & Calendar Sync

## Overview

ShiftSnap is a mobile application that uses LLM Vision technology to convert paper-based shift schedules into digital calendar events. Designed for individual workers in retail, restaurants, and service industries.

## Features

- Photo scan & AI recognition of shift schedules
- Automatic calendar sync (Google Calendar, Apple Calendar)
- Smart alarms before shifts
- Multi-person schedule tracking
- Schedule sharing with friends/family
- Group management for teams

## Tech Stack

- **Mobile App**: React Native + Expo
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **AI/OCR**: Google Gemini Flash
- **Payments**: RevenueCat (planned)

## Project Structure

```
ShiftSnap/
├── apps/
│   ├── mobile/          # React Native + Expo app
│   └── web/             # Landing page (planned)
├── packages/
│   └── shared/          # Shared types, constants, utils
├── supabase/
│   ├── migrations/      # Database migrations
│   └── functions/       # Edge Functions (OCR, etc.)
└── docs/                # Documentation
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Expo CLI (`npm install -g expo-cli`)
- Supabase CLI (`npm install -g supabase`)
- iOS Simulator (Mac) or Android Studio (for mobile development)

### Setup

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/your-username/ShiftSnap.git
   cd ShiftSnap
   pnpm install
   ```

2. **Set up Supabase**
   - Create a project at [supabase.com](https://supabase.com)
   - Copy your project URL and anon key
   - Run database migrations:
     ```bash
     supabase link --project-ref your-project-ref
     supabase db push
     ```

3. **Configure environment variables**
   ```bash
   # Mobile app
   cp apps/mobile/.env.example apps/mobile/.env
   # Edit .env with your Supabase credentials
   ```

4. **Set up Gemini API**
   - Get an API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Add it to Supabase Edge Function secrets:
     ```bash
     supabase secrets set GEMINI_API_KEY=your-key-here
     ```

5. **Create Storage Buckets**
   In Supabase Dashboard > Storage, create:
   - `schedule-images` (private)
   - `avatars` (public)

6. **Start the app**
   ```bash
   pnpm mobile:start
   ```

## Development

### Running the mobile app

```bash
# Start Expo development server
pnpm mobile:start

# Run on iOS simulator
pnpm mobile:ios

# Run on Android emulator
pnpm mobile:android
```

### Database migrations

```bash
# Create a new migration
supabase migration new migration_name

# Apply migrations
supabase db push

# Generate TypeScript types
pnpm supabase:generate-types
```

### Edge Functions

```bash
# Serve locally for testing
supabase functions serve ocr-process --env-file supabase/.env

# Deploy
supabase functions deploy ocr-process
```

## Environment Variables

### Mobile App (.env)

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous key |

### Supabase Edge Functions (Secrets)

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key for OCR |

## License

MIT License - see LICENSE file for details.

## Author

Grayson
