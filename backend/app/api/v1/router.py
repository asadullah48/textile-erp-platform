from fastapi import APIRouter

from app.api.v1.endpoints import auth, team
from app.api.v1.endpoints.fabric import imports, lots, production, reports, rolls, suppliers, yarn

api_router = APIRouter()
for module in (auth, team, suppliers, lots, rolls, yarn, production, imports, reports):
    api_router.include_router(module.router)
