from fastapi import APIRouter
from app.api.v1.endpoints import auth
from app.api.v1.endpoints.fabric import lots, rolls, lot_rolls, summary

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(lots.router)
api_router.include_router(rolls.router)
api_router.include_router(lot_rolls.router)
api_router.include_router(summary.router)
