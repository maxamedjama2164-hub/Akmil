from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="QSPOT_", extra="ignore")

    quran_db_path: Path = ROOT / "data" / "quran.sqlite"
    app_db_path: Path = ROOT / "data" / "app.sqlite"
    recordings_dir: Path = ROOT / "data" / "recordings"

    jwt_secret: str = "dev-secret-change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24 * 7

    whisper_model_id: str = "tarteel-ai/whisper-base-ar-quran"

    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
