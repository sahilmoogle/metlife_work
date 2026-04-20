import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from model.api.v1.authentication import RegisterRequest, LoginRequest, AuthResponse
from model.api.v1 import APIResponse
from model.database.v1.tokens import BlacklistedToken
from core.v1.services.authentication.authentication import AuthService
from utils.v1.connections import get_db
from utils.v1.jwt_utils import get_current_user, oauth2_scheme
from fastapi.security import HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/register",
    response_model=APIResponse[AuthResponse],
    status_code=status.HTTP_201_CREATED,
)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Register a new user account.

    Accepts email, full_name, and password. Hashes the password with bcrypt
    and stores the user record in the database database.

    Args:
        request: RegisterRequest body with email, full_name and password.
        db: Automatically injected database session.

    Returns:
        APIResponse with the created user's access and refresh tokens.

    Raises:
        400: Email already exists or validation fails.
    """
    try:
        user = await AuthService.register_user(db, request)
        return APIResponse(
            success=True,
            status_code=status.HTTP_201_CREATED,
            data=user,
            message="User registered successfully",
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/login", response_model=APIResponse[AuthResponse], status_code=status.HTTP_200_OK
)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Authenticate and obtain a JWT access token.

    Accepts an email along with a password.
    On success returns a Bearer token and refresh token for subsequent authenticated requests.

    Args:
        request: LoginRequest body with email and password.
        db: Automatically injected database session.

    Returns:
        APIResponse containing access_token, refresh_token, and type.

    Raises:
        401: Invalid credentials.
    """
    try:
        user = await AuthService.login_user(db, request)
        return APIResponse(
            success=True,
            status_code=status.HTTP_200_OK,
            data=user,
            message="Login successful",
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


CurrentUser = Annotated[dict, Depends(get_current_user)]


@router.get("/me", response_model=APIResponse[dict], status_code=status.HTTP_200_OK)
async def get_me(current_user: CurrentUser):
    """
    Get the current authenticated user's profile.

    Requires a valid Bearer token in the Authorization header.
    Decodes the JWT and returns the user payload locally.

    Returns:
        APIResponse with the authenticated user's details.

    Raises:
        401: Missing or invalid Bearer token.
    """
    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        message="Authenticated user info",
        data=current_user,
    )


@router.post(
    "/logout", response_model=APIResponse[dict], status_code=status.HTTP_200_OK
)
async def logout(
    current_user: CurrentUser,
    auth: HTTPAuthorizationCredentials = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    Log out the current authenticated user.

    Invalidates the provided JWT by inserting it into the server-side blacklist.
    Any subsequent request using this token will be rejected with 401.

    Args:
        current_user: Injected authenticated user payload.
        auth: The HTTPAuthorizationCredentials extracted from the Authorization header.
        db: Automatically injected database session.

    Returns:
        APIResponse confirming logout success.

    Raises:
        401: Missing or invalid Bearer token.
    """
    db.add(BlacklistedToken(token=auth.credentials))
    await db.commit()
    return APIResponse(
        success=True,
        status_code=status.HTTP_200_OK,
        message="Logout successful. Token has been revoked.",
        data={},
    )
