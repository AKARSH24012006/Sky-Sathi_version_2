from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Every field has a working local default — `docker compose up` and dev mode
    both run with NO .env file. Env vars (UPPERCASE) override automatically."""
    database_url: str = "postgresql+asyncpg://skysathi:skysathi@localhost:5432/skysathi"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_issuer: str = "skysathi"
    access_ttl_min: int = 30
    refresh_ttl_days: int = 90
    openai_api_key: str = ""         # optional: chat uses grounded KB fallback without it
    openai_model: str = "gpt-4o-mini"
    aerodatabox_key: str = ""        # optional: flight status uses demo data without it
    google_client_id: str = ""
    apple_client_id: str = ""
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
