"""JWT access + rotating refresh tokens. Guest-first: an anonymous user row is a
real user; linking Google/Apple/email later UPGRADES the same row (no data loss)."""
import uuid, datetime as dt
from jose import jwt, JWTError
from passlib.context import CryptContext
from ..config import settings

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_pw(p: str) -> str: return pwd.hash(p)
def verify_pw(p: str, h: str) -> bool: return pwd.verify(p, h)

def make_access(user_id: str) -> str:
    now = dt.datetime.utcnow()
    return jwt.encode(
        {"sub": user_id, "iss": settings.jwt_issuer, "iat": now,
         "exp": now + dt.timedelta(minutes=settings.access_ttl_min), "typ": "access"},
        settings.jwt_secret, algorithm="HS256")

def make_refresh(user_id: str) -> tuple[str, str]:
    """Returns (token, jti). jti is stored server-side; rotation invalidates the old one."""
    jti = uuid.uuid4().hex
    now = dt.datetime.utcnow()
    tok = jwt.encode(
        {"sub": user_id, "iss": settings.jwt_issuer, "jti": jti, "iat": now,
         "exp": now + dt.timedelta(days=settings.refresh_ttl_days), "typ": "refresh"},
        settings.jwt_secret, algorithm="HS256")
    return tok, jti

def decode(token: str, typ: str) -> dict:
    claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], issuer=settings.jwt_issuer)
    if claims.get("typ") != typ:
        raise JWTError("wrong token type")
    return claims
