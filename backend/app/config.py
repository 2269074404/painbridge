from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_ENV: str = "development"
    PORT: int = 8000
    # Leave empty to run on an in-memory database (demo mode, data resets on restart).
    MONGODB_URI: str = ""
    MONGODB_DB: str = "painbridge"
    JWT_SECRET: str = "dev-only-change-me-to-a-32-byte-random-string"
    JWT_EXPIRES_IN: int = 86400
    CORS_ORIGINS: str = "http://localhost:3000"
    # Optional regex for deployed frontends whose exact URL isn't known ahead of time
    # (e.g. Render may add a suffix to https://painbridge-web.onrender.com).
    CORS_ORIGIN_REGEX: str = ""
    LITELLM_TOKEN: str = ""
    LITELLM_MODEL: str = "Mistral on-site"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def in_memory(self) -> bool:
        return not self.MONGODB_URI.strip()


settings = Settings()
