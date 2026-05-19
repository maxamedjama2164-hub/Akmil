# Akmil (أكمل)

Competitive 1v1 Quran recitation app. Players take turns picking ayat for their opponent to recite from memory. Voice is transcribed by a fine-tuned Arabic Whisper model and scored against the canonical text. Ratings are tracked with an ELO system.

## Features

- 1v1 competitive matches with real-time WebSocket updates
- Solo practice with five challenge types: recite, guess surah, guess surah number, guess ayah number, mutashabihaat
- ELO rating system with tiered K-factor (floor: 800)
- Arabic ASR via [Tarteel](https://tarteel.ai/) fine-tuned Whisper model
- Scoring validated against the Quran.com search API as a fallback
- Leaderboard, match history, profile page with juz coverage tracker

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI · SQLite · SQLAlchemy · faster-whisper |
| Frontend | Next.js 15 · TypeScript · Tailwind CSS v4 |
| ASR | CTranslate2 (int8) — Tarteel Whisper base fine-tune |
| Realtime | WebSocket (native FastAPI) |

## Setup

### Prerequisites
- Python 3.11+ and [uv](https://github.com/astral-sh/uv)
- Node.js 18+

### 1 — Build the Quran database

```bash
# Clone Tarteel dataset (needed once)
git clone https://github.com/tarteel-ai/quran-data.git tarteel-ml
python QuranSpotTest/backend/scripts/build_quran_db.py
```

### 2 — Backend

```bash
cd QuranSpotTest/backend
uv sync                        # installs all Python dependencies
```

Create a `.env` file inside `QuranSpotTest/backend/`:

```env
QSPOT_JWT_SECRET=change-me-to-a-random-secret

# Optional — Quran.Foundation OAuth2 credentials (boosts scoring accuracy)
# Get them at https://quran.foundation/developers
QSPOT_QURAN_CLIENT_ID=your-client-id
QSPOT_QURAN_CLIENT_SECRET=your-client-secret
```

Start the server:

```bash
uv run uvicorn app.main:app --reload --port 8000
```

### 3 — (Optional) Tarteel Whisper model

For best Arabic transcription accuracy, download and convert the Tarteel fine-tuned model:

```bash
uv pip install transformers torch --extra-index-url https://download.pytorch.org/whl/cpu
python QuranSpotTest/backend/scripts/convert_tarteel_model.py
```

The model is saved to `data/tarteel-base-ct2/`. The backend auto-detects it on startup. Without it, the standard Whisper `base` model is used as a fallback.

### 4 — Frontend

```bash
cd QuranSpotTest/frontend
npm install
npm run dev        # http://localhost:3000
```

## Project Structure

```
QuranSpotTest/
├── backend/
│   ├── app/
│   │   ├── routes/        # FastAPI routers (auth, matches, solo, score, …)
│   │   ├── services/      # Business logic (ELO, scoring, Whisper, similarity, …)
│   │   ├── models.py      # SQLAlchemy ORM models
│   │   └── schemas.py     # Pydantic request/response schemas
│   └── scripts/           # One-time setup scripts
├── frontend/
│   └── src/
│       ├── app/           # Next.js app-router pages
│       ├── components/    # Shared React components
│       └── lib/           # API client, types, WebSocket helpers
└── data/                  # Runtime data (sqlite DBs, generated — not in git)
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `QSPOT_JWT_SECRET` | `dev-secret-…` | JWT signing key — **change in production** |
| `QSPOT_QURAN_CLIENT_ID` | *(none)* | Quran.Foundation OAuth2 client ID |
| `QSPOT_QURAN_CLIENT_SECRET` | *(none)* | Quran.Foundation OAuth2 client secret |
| `QSPOT_CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins |
