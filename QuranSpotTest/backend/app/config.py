from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="QSPOT_", extra="ignore")

    quran_db_path: Path = ROOT / "data" / "quran.sqlite"
    app_db_path: Path = ROOT / "data" / "app.sqlite"
    recordings_dir: Path = ROOT / "data" / "recordings"

    jwt_secret: str = "dev-secret-change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24 * 7

    # Fallback HuggingFace model ID used when whisper_ct2_path doesn't exist.
    # Must be a pre-converted CTranslate2 model (Systran/faster-whisper-* namespace).
    # The Tarteel fine-tune lives at tarteel-ai/whisper-base-ar-quran but needs
    # converting first — run scripts/convert_tarteel_model.py.
    whisper_model_id: str = "base"

    # Path to the local CTranslate2 Tarteel model produced by convert_tarteel_model.py.
    # If this directory exists, it takes priority over whisper_model_id.
    whisper_ct2_path: Path = ROOT / "data" / "tarteel-base-ct2"

    cors_origins: list[str] = ["*"]

    # Quran.Foundation API — OAuth2 client credentials
    quran_client_id: str | None = None
    quran_client_secret: str | None = None
    quran_oauth_endpoint: str = "https://oauth2.quran.foundation"


settings = Settings()
