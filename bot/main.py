"""FastAPI application entry point."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import structlog
import uvicorn

from bot.config import settings
from bot.orchestrator import Orchestrator
from bot.api.routes import router, set_orchestrator

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the orchestrator when the server starts."""
    # Initialize database tables
    try:
        from bot.db.database import init_db
        await init_db()
        logger.info("database_initialized")
    except Exception:
        logger.warning("database_init_skipped", reason="DB not available, running in-memory only")

    orch = Orchestrator()
    set_orchestrator(orch)
    app.state.orchestrator = orch
    task = asyncio.create_task(orch.start())
    logger.info("app_started", mode=settings.execution_mode, port=settings.api_port)
    yield
    await orch.stop()
    task.cancel()


app = FastAPI(
    title="Goystein Bot",
    description="High-speed Polymarket trading bot for ETH/BTC 15-minute markets",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


def main() -> None:
    uvicorn.run(
        "bot.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
