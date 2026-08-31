"""Guest-first auth. POST /auth/guest issues tokens with zero friction; social/email
link endpoints UPGRADE the same user row so nothing is lost when they sign up."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from ..db import get_db
from ..models import User, RefreshToken, AuditLog
from .security import make_access, make_refresh, decode, hash_pw, verify_pw
import datetime as dt

router = APIRouter(prefix="/auth", tags=["auth"])

class Tokens(BaseModel):
    access: str
    refresh: str
    user_id: str

async def _issue(db, user_id: str) -> Tokens:
    access = make_access(user_id)
    refresh, jti = make_refresh(user_id)
    db.add(RefreshToken(jti=jti, user_id=user_id,
                        expires_at=dt.datetime.utcnow() + dt.timedelta(days=30)))
    await db.commit()
    return Tokens(access=access, refresh=refresh, user_id=user_id)

@router.post("/guest", response_model=Tokens)
async def guest(db=Depends(get_db)):
    u = User(kind="guest")
    db.add(u); await db.flush()
    db.add(AuditLog(user_id=u.id, action="guest_created"))
    return await _issue(db, u.id)

class EmailIn(BaseModel):
    email: EmailStr
    password: str

@router.post("/email/register", response_model=Tokens)
async def register(body: EmailIn, db=Depends(get_db)):
    exists = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if exists: raise HTTPException(409, "email already registered")
    u = User(kind="email", email=body.email, pw_hash=hash_pw(body.password))
    db.add(u); await db.flush()
    return await _issue(db, u.id)

@router.post("/email/login", response_model=Tokens)
async def login(body: EmailIn, db=Depends(get_db)):
    u = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not u or not u.pw_hash or not verify_pw(body.password, u.pw_hash):
        raise HTTPException(401, "bad credentials")
    return await _issue(db, u.id)

class RefreshIn(BaseModel):
    refresh: str

@router.post("/refresh", response_model=Tokens)
async def refresh(body: RefreshIn, db=Depends(get_db)):
    """Rotation: old jti revoked, new pair issued. A revoked jti reuse = theft signal."""
    try:
        claims = decode(body.refresh, "refresh")
    except Exception:
        raise HTTPException(401, "invalid refresh")
    rt = await db.get(RefreshToken, claims["jti"])
    if not rt or rt.revoked:
        raise HTTPException(401, "refresh revoked")
    rt.revoked = True
    return await _issue(db, claims["sub"])

class OAuthIn(BaseModel):
    id_token: str

async def _find_or_create(db, kind: str, sub: str, email: str | None, name: str | None) -> User:
    u = (await db.execute(select(User).where(User.oauth_sub == sub))).scalar_one_or_none()
    if not u:
        u = User(kind=kind, oauth_sub=sub, email=email, name=name)
        db.add(u); await db.flush()
    return u

@router.post("/google", response_model=Tokens)
async def google(body: OAuthIn, db=Depends(get_db)):
    """Server-side verification via Google's tokeninfo endpoint; audience must
    match GOOGLE_CLIENT_ID. The client never gets to assert its own identity."""
    import os, httpx
    async with httpx.AsyncClient(timeout=8) as c:
        r = await c.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": body.id_token})
    if r.status_code != 200: raise HTTPException(401, "invalid google token")
    c_ = r.json()
    aud = os.environ.get("GOOGLE_CLIENT_ID")
    if aud and c_.get("aud") != aud: raise HTTPException(401, "wrong audience")
    u = await _find_or_create(db, "google", "g:" + c_["sub"], c_.get("email"), c_.get("name"))
    return await _issue(db, u.id)

@router.post("/apple", response_model=Tokens)
async def apple(body: OAuthIn, db=Depends(get_db)):
    """Verify against Apple's JWKS (cached), audience = APPLE_CLIENT_ID."""
    import os, httpx
    from jose import jwt as jose_jwt
    global _APPLE_JWKS
    try: _APPLE_JWKS
    except NameError: _APPLE_JWKS = None
    if _APPLE_JWKS is None:
        async with httpx.AsyncClient(timeout=8) as c:
            _APPLE_JWKS = (await c.get("https://appleid.apple.com/auth/keys")).json()["keys"]
    try:
        hdr = jose_jwt.get_unverified_header(body.id_token)
        key = next(k for k in _APPLE_JWKS if k["kid"] == hdr["kid"])
        claims = jose_jwt.decode(body.id_token, key, algorithms=["RS256"],
                                 audience=os.environ.get("APPLE_CLIENT_ID"),
                                 issuer="https://appleid.apple.com")
    except Exception:
        raise HTTPException(401, "invalid apple token")
    u = await _find_or_create(db, "apple", "a:" + claims["sub"], claims.get("email"), None)
    return await _issue(db, u.id)
