from pydantic import BaseModel, EmailStr


# REQUEST MODELS


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# RESPONSE MODELS


class AuthResponse(BaseModel):
    access_token: str
    token_type: str
