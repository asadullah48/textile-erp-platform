from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional


class RegisterTenantRequest(BaseModel):
    org_name: str
    slug: Optional[str] = None
    industry: str           # fabric_mill | cmt | export_house | brand
    city: Optional[str] = None
    country: str = "PK"
    currency: str = "PKR"
    full_name: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str

    class Config:
        from_attributes = True


class TenantOut(BaseModel):
    id: str
    org_name: str
    slug: str
    currency: str

    class Config:
        from_attributes = True


class RegisterTenantResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    tenant: TenantOut
