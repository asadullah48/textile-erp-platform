import re
import sys
import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# Make app importable from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.base import Base
# Import ALL models so Alembic sees every table
import app.models.tenant        # noqa: F401
import app.models.subscription  # noqa: F401
import app.models.fabric        # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    url = settings.DATABASE_URL
    # Alembic runs synchronously — swap asyncpg driver for psycopg2
    url = re.sub(r"postgresql\+asyncpg://", "postgresql+psycopg2://", url)
    # asyncpg uses ?ssl=require; psycopg2 uses ?sslmode=require
    url = re.sub(r"[?&]ssl=require", "?sslmode=require", url)
    return url


def run_migrations_offline() -> None:
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(cfg, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
