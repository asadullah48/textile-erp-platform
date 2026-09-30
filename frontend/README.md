# Textile ERP — frontend

Next.js 15 · TypeScript strict · Tailwind v4 · shadcn/ui (base-ui). See the [root README](../README.md).

```bash
npm ci
npm run dev                               # against NEXT_PUBLIC_API_URL (default http://localhost:8000)
NEXT_PUBLIC_DEMO_MODE=browser npm run dev # browser demo: the API is served in-page, no backend
npm run typecheck && npm run build
```

`src/lib/demo/` is a port of the backend's business rules for the public demo. The backend
(`backend/app/services`) is the source of truth; if the two disagree, the demo is the bug.
