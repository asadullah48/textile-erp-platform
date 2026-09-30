from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Industry = Literal["fabric_mill", "cmt", "export_house", "brand"]
Role = Literal["owner", "manager", "operator", "accountant"]


def _password_strength(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    return v


class RegisterTenantRequest(BaseModel):
    org_name: str = Field(min_length=2, max_length=200)
    slug: Optional[str] = None
    industry: Industry
    city: Optional[str] = None
    country: str = Field(default="PK", min_length=2, max_length=2)
    currency: Literal["PKR", "USD"] = "PKR"
    full_name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    password: str

    _check_password = field_validator("password")(_password_strength)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    role: str


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    org_name: str
    slug: str
    currency: str
    industry: Optional[str] = None
    is_demo: bool = False


class RegisterTenantResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    tenant: TenantOut


class MeResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    permissions: list[str]
    tenant: TenantOut


class TeamMemberCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    role: Literal["manager", "operator", "accountant"]  # a second owner is a deliberate, separate action
    password: str

    _check_password = field_validator("password")(_password_strength)


class TeamMemberOut(BaseModel):
    id: str
    user_id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
