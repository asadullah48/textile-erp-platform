from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from app.core.security import decode_jwt

EXEMPT_PREFIXES = (
    "/api/v1/auth/",
    "/api/v1/webhooks/",
    "/api/v1/share-links/",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/health",
)


class TenancyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if any(request.url.path.startswith(p) for p in EXEMPT_PREFIXES):
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing auth token")

        payload = decode_jwt(auth_header.removeprefix("Bearer "))
        tenant_id = payload.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=401, detail="No tenant context in token")

        request.state.tenant_id = tenant_id
        request.state.user_id = payload.get("sub")
        request.state.role = payload.get("role")
        return await call_next(request)
