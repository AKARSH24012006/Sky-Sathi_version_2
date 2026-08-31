from fastapi import APIRouter

router = APIRouter(prefix="/version", tags=["version"])

MIN_SUPPORTED = "1.0.0"
LATEST = "1.0.0"

@router.get("")
async def version():
    """Client checks at startup: below MIN_SUPPORTED -> gentle force-upgrade screen."""
    return {"min_supported": MIN_SUPPORTED, "latest": LATEST,
            "kb_version": "v1", "detector_version": "fsm-1"}
