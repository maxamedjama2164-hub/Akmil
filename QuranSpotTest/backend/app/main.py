import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
from app.routes import (
    auth_routes,
    coverage_routes,
    dev_routes,
    leaderboard_routes,
    match_routes,
    quran_routes,
    score_routes,
    solo_routes,
    ws_routes,
)
from app.services.invite_registry import InviteRegistry
from app.services.matchmaker import Matchmaker
from app.services.quran_service import QuranService
from app.services.similarity_service import SimilarityService
from app.services.whisper_service import WhisperService
from app.ws.connection_manager import ConnectionManager

log = logging.getLogger("quranspot")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    app.state.quran = QuranService()
    app.state.similarity = SimilarityService(settings.quran_db_path)
    app.state.matchmaker = Matchmaker()
    app.state.invites = InviteRegistry()
    app.state.connections = ConnectionManager()
    log.info("loading Whisper model: %s", settings.whisper_model_id)
    app.state.whisper = WhisperService()
    app.state.tx_executor = ThreadPoolExecutor(
        max_workers=1, thread_name_prefix="whisper"
    )
    log.info("Whisper model ready")
    try:
        yield
    finally:
        app.state.tx_executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="QuranSpot", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(coverage_routes.router)
app.include_router(leaderboard_routes.router)
app.include_router(dev_routes.router)
app.include_router(quran_routes.router)
app.include_router(score_routes.router)
app.include_router(match_routes.router)
app.include_router(solo_routes.router)
app.include_router(ws_routes.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
