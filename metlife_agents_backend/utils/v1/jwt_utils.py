import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.v1.jwt_config import jwt_config
from utils.v1.connections import get_db


oauth2_scheme = HTTPBearer()


def create_access_token(data: dict) -> str:
    """Create a JWT access token that does not expire."""
    to_encode = data.copy()

    encoded_jwt = jwt.encode(
        to_encode, jwt_config.JWT_SECRET_KEY, algorithm=jwt_config.JWT_ALGORITHM
    )
    return encoded_jwt


def verify_token(token: str) -> dict:
    """Verify and decode JWT token."""
    try:
        payload = jwt.decode(
            token, jwt_config.JWT_SECRET_KEY, algorithms=[jwt_config.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError:
        raise ValueError("Invalid token")


async def get_current_user(
    auth: HTTPAuthorizationCredentials = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Retrieve the current user payload, rejecting any blacklisted tokens."""
    token = auth.credentials
    from model.database.v1.tokens import BlacklistedToken

    result = await db.execute(
        select(BlacklistedToken).where(BlacklistedToken.token == token)
    )
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = verify_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )

        from model.database.v1.users import User

        user_result = await db.execute(select(User).where(User.user_id == user_id))
        user_obj = user_result.scalars().first()

        if not user_obj:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User no longer exists",
            )

        return {
            "user_id": str(user_obj.user_id),
            "name": user_obj.name,
            "email": user_obj.email,
            "role": user_obj.role,
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )
