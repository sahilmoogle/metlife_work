import bcrypt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from model.database.v1.users import User
from model.api.v1.authentication import (
    RegisterRequest,
    LoginRequest,
    AuthResponse,
)
from utils.v1.jwt_utils import create_access_token


class AuthService:
    @staticmethod
    def hash_password(plain: str) -> str:
        """Hash a plain-text password with bcrypt."""
        return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

    @staticmethod
    async def register_user(db: AsyncSession, request: RegisterRequest) -> AuthResponse:
        # Check existing user
        stmt = select(User).where(User.email == request.email)
        res = await db.execute(stmt)
        if res.scalars().first():
            raise ValueError("Email already registered")

        # Hash password
        password_hash = bcrypt.hashpw(
            request.password.encode(), bcrypt.gensalt()
        ).decode()

        # Create user
        user = User(
            name=request.full_name, email=request.email, password_hash=password_hash
        )

        db.add(user)
        await db.commit()
        await db.refresh(user)

        # Generate token
        access_token = create_access_token({"sub": str(user.user_id)})

        return AuthResponse(
            access_token=access_token,
            token_type="Bearer",
        )

    @staticmethod
    async def login_user(db: AsyncSession, request: LoginRequest) -> AuthResponse:
        # Get user
        stmt = select(User).where(User.email == request.email)
        res = await db.execute(stmt)
        user = res.scalars().first()

        if not user or not bcrypt.checkpw(
            request.password.encode(), user.password_hash.encode()
        ):
            raise ValueError("Invalid email or password")

        # Token
        access_token = create_access_token({"sub": str(user.user_id)})

        return AuthResponse(
            access_token=access_token,
            token_type="Bearer",
        )
