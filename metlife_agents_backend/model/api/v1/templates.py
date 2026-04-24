"""
Pydantic models for the Email Templates API.
"""

from typing import Optional
from pydantic import BaseModel


class EmailTemplateResponse(BaseModel):
    id: str
    scenario_id: str
    persona_code: Optional[str] = None
    product_code: Optional[str] = None
    template_name: str
    subject: str
    body_html: str
    keigo_level: Optional[str] = None
    language: str = "JA"
    version: int = 1
    is_active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class EmailTemplateSummary(BaseModel):
    id: str
    scenario_id: str
    persona_code: Optional[str] = None
    template_name: str
    subject: str
    keigo_level: Optional[str] = None
    language: str = "JA"
    version: int = 1
    is_active: bool = True


class EmailTemplateCreate(BaseModel):
    scenario_id: str
    persona_code: Optional[str] = None
    product_code: Optional[str] = None
    template_name: str
    subject: str
    body_html: str
    keigo_level: Optional[str] = None
    language: str = "JA"
    version: int = 1
    is_active: bool = True


class EmailTemplateUpdate(BaseModel):
    template_name: Optional[str] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    keigo_level: Optional[str] = None
    is_active: Optional[bool] = None
