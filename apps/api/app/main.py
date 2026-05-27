from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import assets, health, jobs, projects
from .settings import settings

app = FastAPI(
    title="AI Webnovel Typography API",
    version="0.1.0",
    description="Service API for the production typography workflow.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
app.include_router(assets.router, prefix="/assets", tags=["assets"])
