from functools import lru_cache

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    service_token: SecretStr
    dms_base_url: str = "http://mock-services:8100/dms"
    notify_base_url: str = "http://mock-services:8100/notify"

    upstream_timeout_seconds: float = 5.0
    max_attempts: int = Field(default=3, ge=1, le=10)
    retry_backoff_seconds: float = Field(default=0.5, ge=0)

    log_level: str = "INFO"
    enable_docs: bool = False

    @field_validator("service_token")
    @classmethod
    def token_must_be_strong(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 32:
            raise ValueError("SERVICE_TOKEN must be at least 32 characters")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
