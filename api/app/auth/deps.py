from fastapi import Depends, HTTPException, Header
from jose import JWTError
from .security import decode

async def current_user_id(authorization: str = Header(...)) -> str:
    try:
        token = authorization.removeprefix("Bearer ").strip()
        return decode(token, "access")["sub"]
    except JWTError:
        raise HTTPException(401, "invalid or expired token")
