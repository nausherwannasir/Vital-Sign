"""
Configuration management for Vital-Sign Backend
"""

import os
from dataclasses import dataclass


@dataclass
class Config:
    """Base configuration"""

    # Flask
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    DEBUG = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    HOST = os.getenv("FLASK_HOST", "0.0.0.0")
    PORT = int(os.getenv("FLASK_PORT", "3000"))

    # Signal Processing
    SAMPLING_RATE = int(os.getenv("SAMPLING_RATE", "30"))
    MIN_SIGNAL_LENGTH = int(os.getenv("MIN_SIGNAL_LENGTH", "50"))
    MIN_HR_FREQ = float(os.getenv("MIN_HR_FREQ", "0.8"))
    MAX_HR_FREQ = float(os.getenv("MAX_HR_FREQ", "3.0"))
    FILTER_ORDER = int(os.getenv("FILTER_ORDER", "4"))
    WELCH_SEGMENT_SIZE = int(os.getenv("WELCH_SEGMENT_SIZE", "128"))

    # CORS
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

    # Logging
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT = os.getenv("LOG_FORMAT", "json")  # json or plain

    # Security
    MAX_REQUEST_SIZE = int(os.getenv("MAX_REQUEST_SIZE", "1000000"))  # 1MB
    RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "False").lower() == "true"
    RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))


class DevelopmentConfig(Config):
    """Development configuration"""

    DEBUG = True
    LOG_LEVEL = "DEBUG"


class ProductionConfig(Config):
    """Production configuration"""

    DEBUG = False
    LOG_LEVEL = "INFO"
    # Require an explicit allow-list; "*" must not be the production default
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "").split(",") if os.getenv("CORS_ORIGINS") else []


class TestingConfig(Config):
    """Testing configuration"""

    TESTING = True
    DEBUG = True
    LOG_LEVEL = "DEBUG"


def get_config():
    """Get config based on environment"""
    env = os.getenv("FLASK_ENV", "development").lower()

    if env == "production":
        return ProductionConfig()
    elif env == "testing":
        return TestingConfig()
    else:
        return DevelopmentConfig()
