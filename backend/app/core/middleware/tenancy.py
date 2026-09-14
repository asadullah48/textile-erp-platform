from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
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

        # HTTPException raised directly inside BaseHTTPMiddleware.dispatch() is not
        # reliably converted into an HTTP response by Starlette's exception handling
        # (that conversion happens at the route/dependency layer, which this code
        # runs before). Return JSONResponse explicitly instead of raising.
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse({"detail": "Missing auth token"}, status_code=401)

        try:
            payload = decode_jwt(auth_header.removeprefix("Bearer "))
        except HTTPException as exc:
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

        tenant_id = payload.get("tenant_id")
        if not tenant_id:
            return JSONResponse({"detail": "No tenant context in token"}, status_code=401)

        request.state.tenant_id = tenant_id
        request.state.user_id = payload.get("sub")
        request.state.role = payload.get("role")
        return await call_next(request)
