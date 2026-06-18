"""Configuration for the Vital-Sign backend, driven by environment variables."""

import os
from dataclasses import dataclass


@dataclass
class Config:
    """Base configuration."""

    # Flask
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    DEBUG = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    HOST = os.getenv("FLASK_HOST", "0.0.0.0")
    PORT = int(os.getenv("FLASK_PORT", "3000"))

    # Signal processing
    SAMPLING_RATE = int(os.getenv("SAMPLING_RATE", "30"))  # fallback fps if client omits it
    MIN_SIGNAL_LENGTH = int(os.getenv("MIN_SIGNAL_LENGTH", "50"))
    MIN_HR_FREQ = float(os.getenv("MIN_HR_FREQ", "0.8"))  # 48 BPM
    MAX_HR_FREQ = float(os.getenv("MAX_HR_FREQ", "3.0"))  # 180 BPM
    FILTER_ORDER = int(os.getenv("FILTER_ORDER", "4"))
    FFT_LENGTH = int(os.getenv("FFT_LENGTH", "4096"))  # zero-padded FFT size; ~0.4 BPM resolution
    MIN_PEAK_POWER = float(os.getenv("MIN_PEAK_POWER", "1e-15"))  # reject flat/silent signals

    # CORS / logging
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")


class DevelopmentConfig(Config):
    DEBUG = True
    LOG_LEVEL = "DEBUG"


class ProductionConfig(Config):
    DEBUG = False
    LOG_LEVEL = "INFO"
    # Require an explicit allow-list; "*" must not be the production default
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "").split(",") if os.getenv("CORS_ORIGINS") else []


class TestingConfig(Config):
    DEBUG = True
    LOG_LEVEL = "DEBUG"


def get_config():
    """Return the config for the current FLASK_ENV."""
    env = os.getenv("FLASK_ENV", "development").lower()
    return {"production": ProductionConfig, "testing": TestingConfig}.get(env, DevelopmentConfig)()
