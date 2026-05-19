from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    f"sqlite:///{settings.app_db_path}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _migrate() -> None:
    """Add columns that may not exist in older databases (SQLite ALTER TABLE)."""
    new_columns = [
        "ALTER TABLE users ADD COLUMN bio VARCHAR(200)",
        "ALTER TABLE users ADD COLUMN avatar_data TEXT",
    ]
    with engine.connect() as conn:
        for sql in new_columns:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # column already exists


def init_db() -> None:
    settings.app_db_path.parent.mkdir(parents=True, exist_ok=True)
    from app import models  # noqa: F401  — register mappers with Base.metadata
    Base.metadata.create_all(engine)
    _migrate()


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
