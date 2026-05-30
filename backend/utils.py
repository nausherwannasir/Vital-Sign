"""
Middleware and utilities for request handling and security.
"""

from functools import wraps
from flask import request, jsonify, g
from typing import Callable, Any
import time
import logging

logger = logging.getLogger(__name__)


class RateLimiter:
    """Simple in-memory rate limiter."""

    def __init__(self, max_requests: int = 60, window: int = 60):
        """
        Initialize rate limiter.

        Args:
            max_requests: Maximum requests allowed per window
            window: Time window in seconds
        """
        self.max_requests = max_requests
        self.window = window
        self.requests = {}

    def is_allowed(self, identifier: str) -> bool:
        """Check if request is allowed for identifier."""
        now = time.time()

        if identifier not in self.requests:
            self.requests[identifier] = []

        # Remove old requests outside window
        self.requests[identifier] = [
            req_time
            for req_time in self.requests[identifier]
            if now - req_time < self.window
        ]

        # Check limit
        if len(self.requests[identifier]) >= self.max_requests:
            return False

        self.requests[identifier].append(now)
        return True


def rate_limit(limiter: RateLimiter, key_func: Callable = None):
    """
    Rate limiting decorator.

    Args:
        limiter: RateLimiter instance
        key_func: Function to get rate limit key (default: IP address)
    """

    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def decorated_function(*args, **kwargs) -> Any:
            if key_func:
                key = key_func()
            else:
                key = request.remote_addr

            if not limiter.is_allowed(key):
                logger.warning(f'Rate limit exceeded for {key}')
                return jsonify({'error': 'Rate limit exceeded'}), 429

            return f(*args, **kwargs)

        return decorated_function

    return decorator


def log_request():
    """Log request information."""
    g.start_time = time.time()

    def after_request(response):
        duration = time.time() - g.start_time
        logger.info(
            f'{request.method} {request.path} - {response.status_code} ({duration:.3f}s)'
        )
        return response

    return after_request


def validate_signal(signal: list, min_length: int = 50, max_length: int = 10000) -> tuple:
    """
    Validate signal input.

    Args:
        signal: Signal data
        min_length: Minimum signal length
        max_length: Maximum signal length

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(signal, list):
        return False, 'Signal must be an array'

    if len(signal) < min_length:
        return False, f'Signal too short. Minimum {min_length} samples required'

    if len(signal) > max_length:
        return False, f'Signal too long. Maximum {max_length} samples allowed'

    # Validate signal values
    for i, value in enumerate(signal):
        try:
            float(value)
        except (ValueError, TypeError):
            return False, f'Signal value at index {i} is not numeric'

    return True, None
