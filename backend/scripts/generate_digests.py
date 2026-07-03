"""Regenerate all raion digests. Run from backend/:

    uv run python -m scripts.generate_digests
"""

from app.services.digest_service import generate_all

if __name__ == "__main__":
    generate_all()
